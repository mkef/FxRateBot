/*-----------------------------------------------------------------------------
    Foreign Currency conversion Bot. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var request = require('request');
var clientService = require('./service');

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
.matches('Help', (session) => {
    //session.send('You reached Help intent, you said \'%s\'.', session.message.text);
    session.endDialog('Foreign Currency Conversion Bot.');
})
.matches('Cancel', (session) => {
    //session.send('You reached Cancel intent, you said \'%s\'.', session.message.text);
    session.beginDialog('end');
})
/*
.matches('<yourIntent>')... See details at http://docs.botframework.com/builder/node/guides/understanding-natural-language/
*/
.onDefault((session) => {
    session.send('Sorry, I did not understand \'%s\'.', session.message.text);
    session.beginDialog('none');
});

bot.dialog('/', intents);    

intents.matches(/(exchange|into CAD|to CAD)/i, (session,args) => {
	session.beginDialog('getExchangeRateFlow');
});
    

//Conversation End
bot.dialog('end',
    (session)=>{
        session.endDialog("Have a nice day.");
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
]    
);

//Greeting Dialog
bot.dialog('greeting',
    (session)=>{
        session.endDialog('Hi%s how can I help you.', session.message.user.name == 'You' ? ',' : ' ' + session.message.user.name + ',');
    }
);

bot.dialog('getExchangeRate',[
   (session, args, next)=>{
        console.log("Start");
        console.log(args);
          
        var clientCode,clientName,amount,toCurrency,fromCurrency,rate;
        
        if(args.entities){
            
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
        //Go Client
        var clientCode = args.response;
        var rate = null;
        var amount =  session.dialogData.amount;
        var fromCurrency = session.dialogData.fromCurrency;
        var toCurrency = session.dialogData.toCurrency;
        var userRate = session.dialogData.rate;
        
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
        var message = `Let me check ${amount} ${fromCurrency.toUpperCase()} to ${toCurrency.toUpperCase()} for ${clientCode}`;
 
        rate.then(
            (rate)=>{  
              if(clientCode.toLowerCase() == 'new client'){
                   //Business logic for new client                           
                }else{
                   //Business logic for existing client
                   console.log("BC Client");
                   console.log("R: " + rate);
                   rate += 0.002; 
                }
                //4 decimal points
                rate = rate.toFixed(4);     
                   
                session.send(message);
                var total = (rate * amount).toFixed(2);
                
                //Dummy contrac Data
                var contractData = {clientCode:clientCode, amount: amount, currency: toCurrency, rate: rate, userRate: userRate};
                session.dialogData.contractData = contractData;
                if(!session.dialogData.rate){
                    message = `We can do ${rate}\n Total amount ${toCurrency.toUpperCase()} ${total}`; 
                    session.send(message);                    
                }else{
                    //TO DO
                    message = `We can do ${rate}\n Total amount ${toCurrency.toUpperCase()} ${total}`; 
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
        if(args.response){
            session.send(`Contract booked, contract #${args.response}`);
            next();
        }else{
            var contractData = session.dialogData.contractData;
            var res = clientService.reRate(contractData);
            if(res){
                console.log("RES @ END1");
                console.log(res);
                res = parseFloat(res);
                console.log(res);
                res = res.toFixed(4);
                session.send(`Ok, we can go for ${res}`); 
                session.beginDialog('getConfirmation', contractData);
            }else{
                session.send(`Unfortunately, we can do only ${contractData.rate} right now`);
                session.beginDialog('getConfirmation', contractData);
            }
        }        
        
    },
    (session,args)=>{
        console.log("END");
        console.log(args);
        if(args.response){
           session.send(`Contract booked, contract #${args.response}`);
        }
        session.endDialog('Thank You');       
        
    }
]);

bot.dialog('getConfirmation',[
    (session,args)=>{
        console.log(args);
        session.dialogData.clientData = args;
        builder.Prompts.confirm(session, "Does client wish to proceed?");        
    },
    (session,args)=>{
        console.log(args);
        var clientData =  session.dialogData.clientData;
        if(args.response){
            var code = clientService.bookContract(clientData);
            session.endDialogWithResult({ response: code});
        }else{            
            session.endDialogWithResult({ response: false});        
            
        }
    }
]);

bot.dialog('getClientCode',[
    (session)=>{
        builder.Prompts.text(session, 'What is the client code.Type \'New Client\' if not an existing client');
    },
    (session, args)=>{
        if(args.response){
            var clientCode = args.response;
            session.endDialogWithResult({ response: clientCode});           
        }else{
            // Repeat the dialog
            session.replaceDialog('getClientCode', { reprompt: true });
        } 
    }
]);

//Get To currency dialog
bot.dialog('getToCurrency',[
    (session)=>{
        builder.Prompts.choice(session, 'What currency client want to buy', currencyTypes
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
        builder.Prompts.choice(session, 'What currency client want to sell', currencyTypes
             ,{
                 listStyle: builder.ListStyle.none, 
                 maxRetries:2,
                 retryPrompt: 'it is not a valid currency'
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
        builder.Prompts.text(session, 'what is the amount',
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

//Valid currency types
var currencyTypes = ['AFN','EUR','ALL','DZD','USD','AOA','XCD','ARS','AMD','AWG','SHP','AUD','AZN','BSD','BHD','BDT','BBD','BYN','BZD','XOF','BMD','BTN','BOB','BAM','BWP','BRL','BND','BGN','BIF','CVE','KHR','XAF','CAD','KYD','NZD','CLP','CNY','COP','KMF','CDF','none','CRC','HRK','CUP','ANG','CZK','DKK','DJF','DOP','EGP','ERN','ETB','FKP','FJD','XPF','GMD','GEL','GHS','GIP','GTQ','GGP','GNF','GYD','HTG','HNL','HKD','HUF','ISK','INR','IDR','XDR','IRR','IQD','IMP','ILS','JMD','JPY','JEP','JOD','KZT','KES','KWD','KGS','LAK','LBP','LSL','LRD','LYD','CHF','MOP','MKD','MGA','MWK','MYR','MVR','MRU','MUR','MXN','MDL','MNT','MAD','MZN','MMK','NAD','NPR','NIO','NGN','KPW','NOK','OMR','PKR','PGK','PYG','PEN','PHP','PLN','QAR','RON','RUB','RWF','WST','STN','SAR','RSD','SCR','SLL','SGD','SBD','SOS','ZAR','GBP','KRW','SSP','LKR','SDG','SRD','SZL','SEK','SYP','TWD','TJS','TZS','THB','TOP','TTD','TND','TRY','TMT','UGX','UAH','AED','UYU','UZS','VUV','VEF','VND','YER','ZMW'];

//Currency Exchange Dialog 
bot.dialog('getExchangeRateFlow',[
    (session)=>{
         builder.Prompts.choice(session, 'What currency do you want to exchange to CAD?', currencyTypes
             , {
                 listStyle: builder.ListStyle.none, 
                 maxRetries:2,
                 retryPrompt: 'Please type valid currency type.'
               });
    },
    (session, results)=>{
        if(results.response){
            session.dialogData.currency = results.response.entity;
            builder.Prompts.number(session, 'Amount you want to exchange?', {minValue:1,maxRetries:2});            
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
            var massage  = `${session.dialogData.currency} ${session.dialogData.amount} to CAD` ;
            
            ///session.send(massage);         
          
            //Service call to get currency exchange rates
            request(`https://free.currencyconverterapi.com/api/v5/convert?q=${currencyEx}&compact=ultra`
                , { json: true }
                , (err, res, body) => {
                  if (err) { 
                      session.endDialog(err);
                      return console.log(err); 
                   }
                 
                 var exchangeRate = body[currencyEx];
                 //Validate result
                 if(exchangeRate){
                     var transaction = exchangeRate * session.dialogData.amount;
                  
                     if(Object.keys(exchangeRate).length === 0 && exchangeRate.constructor === Object){
                         session.endDialog('Invalid Currency type.');
                     }else{
                         session.send(`${massage} at ${exchangeRate} \n CAD ${transaction}`);
                         builder.Prompts.confirm(session, "Does client wants to proceed?");
                     } 
                 }else{
                     session.endDialog('Invalid Currency type.');
                     session.beginDialog('end');
                 }                
            });
            
        }else{
            session.endDialogWithResult({
                resumed: builder.ResumeReason.notCompleted
            });
        }   
    },
    (session,args)=>{
        if(args.response){
            session.beginDialog('booking');
            session.beginDialog('end');
        }else{
             session.endDialog('Sorry thats the best rate we can give.');
             session.beginDialog('end');
        }
    }
]);

//Booking Dialog
bot.dialog('booking',
    (session)=>{
        session.endDialog('Booking Completed.');
    }
);