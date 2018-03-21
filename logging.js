/*-----------------------------------------------------------------------------
    Logging Service. 
-----------------------------------------------------------------------------*/

var azureStorage = require('azure-storage');

function log(data, mType) {

    try {

        if (data) {           
            var cString = process.env['AzureWebJobsStorage'].split(';');
            var AccountName = cString[1].replace('AccountName=', '');
            var AccountKey = cString[2].replace('AccountKey=', '');
            
            var tableSvc = azureStorage.createTableService(AccountName, AccountKey);
            var tableName = 'chatLog';
            tableSvc.createTableIfNotExists(tableName, function (error, result, response) {
                if (!error) {
                   
                    // Table exists or created
                    console.log("Table exists or created");
                    var user = 'Bot';
                    if(data.address){
                        user = data.address.user.name;
                    }
                    var pKey = Math.floor(Math.random() * Math.floor(Math.pow(100,10))) + '';
                    var entGen = azureStorage.TableUtilities.entityGenerator;
                    var task = {
                        PartitionKey: entGen.String(pKey),
                        RowKey: entGen.String(mType),                        
                        Message: entGen.String(data.text),
                        User: entGen.String(user),
                        RawData: entGen.String(JSON.stringify(data)),
                    };
                    tableSvc.insertEntity(tableName, task, function (error, result, response) {
                        if (!error) {
                            // Entity inserted
                            console.log("Entity inserted");
                        }
                        console.log(error);
                    });
                }
            });
        }


    } catch (error) {
        console.log(error);
    }



}
module.exports = {
    log: (data, mType) => {
        log(data, mType);
    }
};