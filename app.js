/*-----------------------------------------------------------------------------
    Foreign Currency Exchange Rate Bot. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var request = require('request');
var clientService = require('./service');
var loggingService = require('./logging');

//Valid currency types
var currencyTypes = ['AFN','EUR','ALL','DZD','USD','AOA','XCD','ARS','AMD','AWG','SHP','AUD','AZN','BSD','BHD','BDT','BBD','BYN','BZD','XOF','BMD','BTN','BOB','BAM','BWP','BRL','BND','BGN','BIF','CVE','KHR','XAF','CAD','KYD','NZD','CLP','CNY','COP','KMF','CDF','none','CRC','HRK','CUP','ANG','CZK','DKK','DJF','DOP','EGP','ERN','ETB','FKP','FJD','XPF','GMD','GEL','GHS','GIP','GTQ','GGP','GNF','GYD','HTG','HNL','HKD','HUF','ISK','INR','IDR','XDR','IRR','IQD','IMP','ILS','JMD','JPY','JEP','JOD','KZT','KES','KWD','KGS','LAK','LBP','LSL','LRD','LYD','CHF','MOP','MKD','MGA','MWK','MYR','MVR','MRU','MUR','MXN','MDL','MNT','MAD','MZN','MMK','NAD','NPR','NIO','NGN','KPW','NOK','OMR','PKR','PGK','PYG','PEN','PHP','PLN','QAR','RON','RUB','RWF','WST','STN','SAR','RSD','SCR','SLL','SGD','SBD','SOS','ZAR','GBP','KRW','SSP','LKR','SDG','SRD','SZL','SEK','SYP','TWD','TJS','TZS','THB','TOP','TTD','TND','TRY','TMT','UGX','UAH','AED','UYU','UZS','VUV','VEF','VND','YER','ZMW'];

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
    //session.send('Hi%s how can I help you.', session.message.user.name == 'You' ? ',' : ' ' + session.message.user.name + ',');
    session.beginDialog('greeting');
})
.matches('GetExchangeRate', (session, args, next) => {
   session.beginDialog('getExchangeRate', args, next);
})
.matches('Help', (session, args, next) => {
    //session.send('You reached Help intent, you said \'%s\'.', session.message.text);
    //session.endDialog('Foreign Currency Conversion Bot.');
    session.send('Hi, I can help you to get Foreign Currency Exchange Rates');
    session.beginDialog('getExchangeRate', args, next);
})
.matches('Cancel', (session) => {
    //session.send('You reached Cancel intent, you said \'%s\'.', session.message.text);
    session.beginDialog('end');
})
/*
.matches('<yourIntent>')... See details at http://docs.botframework.com/builder/node/guides/understanding-natural-language/
*/
.onDefault((session, args, next) => {
    session.send('Sorry, I did not understand \'%s\'.', session.message.text);
    //session.beginDialog('none');
    session.send('I can help you to get Foreign Currency Exchange Rates');
    session.beginDialog('getExchangeRate', args, next);
});

bot.dialog('/', intents);    

/*
intents.matches(/(exchange|into CAD|to CAD)/i, (session,args) => {
	session.beginDialog('getExchangeRateFlow');
});*/ 

//Conversation End
bot.dialog('end',
    (session)=>{
        session.endDialog("Ok thanks.\nIf you need help please call the FX desk at 1800-461-2422");
    }
);

//Did not understand
bot.dialog('none',[
    (session)=>{
        builder.Prompts.confirm(session, "Do you want to get CAD Exchange Rate.");
    },(session,args)=>{
        if(args.response){
            session.beginDialog('getExchangeRateFlow');
        }else{
            session.beginDialog('end');
        }        
    }
]);

//Greeting Dialog
bot.dialog('greeting',
    (session)=>{
         loggingService.log("");
        session.endDialog('Hi%s how can I help you.', session.message.user.name == 'You' ? ',' : ' ' + session.message.user.name + ',');
    }
    
);

//Get Exchange Rate Dialog
bot.dialog('getExchangeRate',[
   (session, args, next)=>{
        console.log("Start");
        console.log(args);
          
        var clientCode,clientName,amount,toCurrency,fromCurrency,rate;
        
        if(args.entities){
            //Get LUIS entities
            clientCode = builder.EntityRecognizer.findEntity(args.entities, 'ClientCode');
            clientName = builder.EntityRecognizer.findEntity(args.entities, 'Communication.ContactName');
            amount = builder.EntityRecognizer.findEntity(args.entities, 'Amount');
            toCurrency = builder.EntityRecognizer.findEntity(args.entities, 'Currency::ToCurrency');
            fromCurrency = builder.EntityRecognizer.findEntity(args.entities, 'Currency::FromCurrency');
            rate = builder.EntityRecognizer.findEntity(args.entities, 'Rate');
        }
        
        session.dialogData.toCurrency = toCurrency != null ? toCurrency.entity : null;
        session.dialogData.fromCurrency = fromCurrency !=null ? fromCurrency.entity : null;
        session.dialogData.clientCode = clientCode != null ? clientCode.entity : null;
        session.dialogData.clientName = clientName != null ? clientName.entity : null;
        session.dialogData.amount = amount != null ? amount.entity : null;
        session.dialogData.rate = rate != null ? rate.entity.replace(' ','').replace(' ','')  : null;        
        
        //From Currency
        if(!fromCurrency){
            session.beginDialog('getFromCurrency');
        }else{
            next();
        }
        
   },
   (session,args,next)=>{       
       //Got FromCurrency
        var fromCurrency = args.response;
        if(!session.dialogData.fromCurrency){
            session.dialogData.fromCurrency = fromCurrency;
        }        
        console.log(fromCurrency);
        console.log();
       //To Currency
       if(!session.dialogData.toCurrency){
            session.beginDialog('getToCurrency');
        }else{
            next();
        }
   },
    (session,args,next)=>{
        console.log("ToCurrency");
        console.log(args);
        //Got ToCurrency
        var toCurrency = args.response;
        if(!session.dialogData.toCurrency){
            session.dialogData.toCurrency = toCurrency;
        }        
        console.log(toCurrency);
        //Amount
        if(!session.dialogData.amount){
             session.beginDialog('getAmount');
        }else{
            next();
        }       
    },
    (session,args,next)=>{
        console.log("Amount");
        console.log(args);
        //Got the Amount
        var amount = args.response;
        if(!session.dialogData.amount){
            session.dialogData.amount = amount;
        }        
        console.log(amount);
        console.log("Client Code");
        console.log(session.dialogData.clientCode);
        //Client Data - Code/Name
        if(session.dialogData.clientCode){
             next();
        }else if(session.dialogData.clientName){
            //Call service and get client code
            var clientCode = clientService.getClientByName(session.dialogData.clientName);
            session.dialogData.clientCode = clientCode;
            next();
        }else{
            session.beginDialog('getClientCode');
        } 
    },
    (session,args,next)=>{
        console.log("Client");
        console.log(args);
        //Got Client
        
        var clientCode = null;
        var transitNumber = null;
        if(args.response){
            clientCode = args.response.clientName || args.response.clientCode;
            transitNumber = args.response.transitNumber || null;
        }
        
        var rate = null;
        var amount =  session.dialogData.amount;
        var fromCurrency = session.dialogData.fromCurrency;
        var toCurrency = session.dialogData.toCurrency;
        var userRate = session.dialogData.rate;
        
        //Set client code
        if(!session.dialogData.clientCode){
            session.dialogData.clientCode = clientCode;
        }else{
            clientCode = session.dialogData.clientCode;
        }     
        
        rate = clientService.getCurrencyRates(fromCurrency,toCurrency); 
        //k conversion
        if(amount){            
            amount = convertK(amount);
            if(amount){                
                session.dialogData.amount = amount;                 
            } 
        }
        var message = `Let me get a rate for total amount of ${amount} ${fromCurrency.toUpperCase()} for ${clientCode}`;
 
        rate.then(
            (rate)=>{  
              if(clientCode.match(/new client/gi)){
                   //TODO:Business logic for new client                           
                }else{
                   //TODO:Business logic for existing client
                   console.log("BC Client");
                   console.log("R: " + rate);
                   rate += 0.002; 
                }
                //4 decimal points
                rate = rate.toFixed(4); 
                
                var total = (rate * amount).toFixed(2);
                
                //Dummy contrac Data
                var contractData = {clientCode:clientCode, amount: amount, currency: toCurrency, rate: rate, userRate: userRate, transitNumber: transitNumber};
                session.dialogData.contractData = contractData;
                if(!session.dialogData.rate){
                    session.send(message);
                    message = `We can sell ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()} at ${rate}\n Total amount ${toCurrency.toUpperCase()} ${total}`; 
                    session.send(message);                    
                }else{
                    message = `Thanks, let me check if we can match ${session.dialogData.rate} for total amount of ${amount} ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()} for ${clientCode}`;
                    session.send(message);
                    //Crosscheck rates
                    if(parseFloat(session.dialogData.rate) <= rate){
                       message =  'Yes, we can match.';
                    }else{
                         message = `No, we can't match.The best we can offer is ${rate}`; 
                    }                   
                    session.send(message);                    
                }
                
                session.beginDialog('getConfirmation', contractData);
            },
            (err)=>{
                console.log(err);
            }
        ); 
    },
    (session, args, next)=>{        
        console.log("END1");
        console.log(args);
        if(args.response && args.response !== 'betterRate'){ 
            //Book contract           
            session.dialogData.booked = true;
            session.send(`Contract number is #${args.response}. \nPlease use directly to settle the trade in COINS.\nIf you have any issues requiring modification or cancellation, please call the FX desk at 1800-461-2422`);
            next();
        }else if(args.response === 'betterRate'){
            //Rate again
            //TODO: 
            var contractData = session.dialogData.contractData;
            var res = clientService.reRate(contractData);
            if(res){
                console.log("RES @ END1");
                console.log(res);
                res = parseFloat(res);
                console.log(res);
                res = res.toFixed(4);
                session.send(`Ok, The best we can offer is ${res}`); 
                session.beginDialog('getConfirmation', contractData);
            }else{
                session.send(`The best we can offer is ${contractData.rate}`);
                session.beginDialog('getConfirmation', contractData);
            }
        }else{
            //Terminate
            next();
        }       
        
    },
    (session,args)=>{
        console.log("END");
        console.log(args);
        if(args.response){
           session.send(`Contract number is #${args.response}. \nPlease use directly to settle the trade in COINS.\nIf you have any issues requiring modification or cancellation, please call the FX desk at 1800-461-2422`);
        }else if(!session.dialogData.booked){
           session.send('Nothing booked, please feel free to call the FX desk at 1800-461-2422 for any further inquiries');
        }
        var endMessage = new builder.Message(session).text(['Thank You','Thank You, Have a nice day','Thanks for contacting traders RSG']);    
        session.endDialog(endMessage);       
        
    }
])//Once triggered, will end the dialog.
.cancelAction('end', 'Ok thanks.\nIf you need help please call the FX desk at 1800-461-2422', {
    matches: /^nevermind$|^cancel$|^stop$/i
});

//Get Confirmation to proceed
bot.dialog('getConfirmation',[
    (session, args, next)=>{
        console.log(args);
        session.dialogData.clientData = args;
        builder.Prompts.text(session, "Do you want to proceed?");        
    },
    (session, args, next)=>{
        console.log(args);
        var clientData =  session.dialogData.clientData;
        if(args.response){
            if(args.response.match(/no/gi)){
                session.endDialogWithResult({ response: false});
            }else if (args.response.match(/better rate/gi)){
                session.endDialogWithResult({ response: 'betterRate'});
            }else if(args.response.match(/yes|ok/gi)){
                //TODO: Update Client Rate with system Rate
                var code = clientService.bookContract(clientData);
                session.endDialogWithResult({ response: code});
            }else{
                // Repeat the dialog
                session.replaceDialog('getConfirmation', { reprompt: true });
            }            
            
        }else{            
            session.endDialogWithResult({ response: false});        
            
        }
    }
]);

//Get Client Code
bot.dialog('getClientCode',[
    (session, args, next)=>{
        builder.Prompts.text(session, 'What is the Client Id?');
    },
    (session, args, next)=>{
        if(args.response){
            if(args.response.match(/new client/gi)){
                next();
            }else{
                //TODO: Validate client name
                var clientCode = args.response;
                session.endDialogWithResult({response:{ clientCode: clientCode}});
            }
                       
        }else{
            // Repeat the dialog
            session.replaceDialog('getClientCode', { reprompt: true });
        } 
    },
    (session, args, next)=>{
        builder.Prompts.text(session, 'Ok, what is the clients name?');
    },
    (session, args, next)=>{
        if(args.response){
            var clientName = args.response;
            session.dialogData.clientName = clientName;
            builder.Prompts.text(session, 'What is your transit number?');
        }else{
            // Repeat the dialog
            session.replaceDialog('getClientCode', { reprompt: true });
        } 
    },
    (session, args, next)=>{
        if(args.response){
            var transitNumber = args.response;            
            session.send('Ok we can still quote this client even if they don\'t have a code but please fill out form 7699 to create one for them today');
            session.endDialogWithResult({response:{clientName: session.dialogData.clientName, transitNumber: transitNumber}});
        }else{
            // Repeat the dialog
            session.replaceDialog('getClientCode', { reprompt: true });
        } 
    }
]);

//Get To currency dialog
bot.dialog('getToCurrency',[
    (session)=>{
        builder.Prompts.choice(session, 'What currency client wants to buy?', currencyTypes
             ,{
                 listStyle: builder.ListStyle.none, 
                 maxRetries:2,
                 retryPrompt: 'Please type valid currency'
        });
    },
    (session, args)=>{
        if(args.response){
            var toCurrency = args.response.entity;
            session.endDialogWithResult({ response: toCurrency});           
        }else{
            // Repeat the dialog
            session.replaceDialog('getToCurrency', { reprompt: true });
        } 
    }
]);

//Get To currency dialog
bot.dialog('getFromCurrency',[
    (session)=>{
        builder.Prompts.choice(session, 'What currency client wants to sell?', currencyTypes
             ,{
                 listStyle: builder.ListStyle.none, 
                 maxRetries:2,
                 retryPrompt: 'Please type valid currency'
        });
    },
    (session, args)=>{
        if(args.response){
            var fromCurrency = args.response.entity;
            session.endDialogWithResult({ response: fromCurrency});           
        }else{
            // Repeat the dialog
            session.replaceDialog('getFromCurrency', { reprompt: true });
        } 
    }
]);

//Get Amount dialog
bot.dialog('getAmount',[
    (session)=>{
        builder.Prompts.text(session, 'What is the amount?',
            {
                 minValue:1, 
                 maxRetries:2
        });
    },
    (session, args)=>{        
        if(args.response){           
            var amount = args.response;
            if(amount){      
                    
                if(!amount){  
                   session.replaceDialog('getAmount', { reprompt: false });     
                }          
            }
            session.endDialogWithResult({ response: amount});           
        }else{
            // Repeat the dialog
            session.replaceDialog('getAmount', { reprompt: true });
        } 
    }
]);

// Middleware for logging
bot.use({
    receive: function (event, next) { 
        try {
            loggingService.log(event, 'receive');
        } catch (error) {
            console.log(error);
        }       
        
        next();
    },
    send: function (event, next) {        
        try {
            loggingService.log(event, 'send');
        } catch (error) {
            console.log(error);
        } 
        next();
    }
});

//Convert K value (5k to 5000)
function convertK(num){
    console.log("Conver k");
    console.log(num);
    if(!num){
        return null;
    }
    var n = num.match(/\d+k/i);   
    console.log(n);
    if(n){   
        console.log(n);                     
        n = n[0].toLowerCase().replace('k',"");
        console.log(n);
        return n = parseInt(n) * 1000;                   
    }else{
         num = num.match(/\d+/i);
         if(num){  
             return num;
         }         
    }
}



