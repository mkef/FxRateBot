/*-----------------------------------------------------------------------------
    Foreign Currency conversion Bot. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var request = require('request');

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
bot.set('storage', tableStorage);

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';

const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
.matches('Greeting', (session) => {
    session.send('Hi%s how can I help you.', session.message.user.name == 'You' ? ',' : ' ' + session.message.user.name + ',');   
})
.matches('Help', (session) => {
    //session.send('You reached Help intent, you said \'%s\'.', session.message.text);
    session.endDialog('Foreign Currency Conversion Bot.');
})
.matches('Cancel', (session) => {
    //session.send('You reached Cancel intent, you said \'%s\'.', session.message.text);
    session.endDialog('Goodbye.');
})
/*
.matches('<yourIntent>')... See details at http://docs.botframework.com/builder/node/guides/understanding-natural-language/
*/
.onDefault((session) => {
    session.send('Sorry, I did not understand \'%s\'.', session.message.text);
});

bot.dialog('/', intents);    

intents.matches(/(exchange|into CAD|to CAD)/i, (session,args) => {
	session.beginDialog('getExchangeRate');
});
    
//Currency Exchange Dialog 
bot.dialog('getExchangeRate',[
    (session)=>{
         builder.Prompts.text(session, 'What currency you want to exchange to CAD?');
    },
    (session, args)=>{
        
        if(args.response){
            console.log(args);
            session.dialogData.currency = args.response.toUpperCase();
            builder.Prompts.number(session, 'Amount you want to exchange?', {minValue:1,maxRetries:3});            
        }else{
            session.endDialogWithResult({
                resumed: builder.ResumeReason.notCompleted
            });
        }        
    },
    (session,args)=>{
        
        if(args.response){
            
            session.dialogData.amount = args.response;
            var currencyEx = session.dialogData.currency + '_CAD';
            var massage  = `Converting ${session.dialogData.currency} to CAD. \nAmount: ${session.dialogData.currency} ${session.dialogData.amount}` ;
            
            session.send(massage);         
          
            //Service call to get currency exchange rates
            request(`https://free.currencyconverterapi.com/api/v5/convert?q=${currencyEx}&compact=ultra`
                , { json: true }
                , (err, res, body) => {
                  if (err) { 
                      session.endDialog(err);
                      return console.log(err); 
                   }
                 
                 var exchangeRate = body[currencyEx];
                 var transaction = exchangeRate * session.dialogData.amount;
                  
                 if(Object.keys(exchangeRate).length === 0 && exchangeRate.constructor === Object){
                     session.endDialog('Invalid Currency type.');
                 }else{
                     session.endDialog(`Rate: ${exchangeRate} \n CAD  ${transaction}`);
                 } 
            });
            
        }else{
            session.endDialogWithResult({
                resumed: builder.ResumeReason.notCompleted
            });
        }   
    }
]);