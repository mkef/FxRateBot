/*-----------------------------------------------------------------------------
    Client Service. 
-----------------------------------------------------------------------------*/

var request = require('request');

module.exports = {
	getClientByName : (clientName)=>{
		if(clientName){
			//Mock service
			if(clientName.toLowerCase() == 'dennis huang'){
				return 'u12';
			}
			return 'new client';
		}
	},
    bookContract : (data)=>{
        if(data){
            return Math.floor(100000 + Math.random() * 900000);
        }
    },
    reRate : (data)=>{
        //{clientCode:clientCode, amount: amount, currency: toCurrency, rate: rate};
        if(data){
            console.log(data);
            if(data.rate && !data.userRate){
                console.log("OK "+ data.rate );
                return parseFloat(data.rate) + 0.001;
                
            }else if(data.userRate && data.rate){
                var rsl = parseFloat(data.userRate) - parseFloat(data.rate);
                console.log("RES");
                console.log(rsl);
                if( rsl < 0 || rsl > 0 && rsl <= 0.002){
                    return data.userRate;
                }else{
                    return null;
                }
            }            
        }
    },
	getCurrencyRates : (fromCurrency, toCurrency)=>{
        
        return new Promise((resolve,reject) =>{
    		console.log("Service rate");
            console.log(fromCurrency);
            console.log(toCurrency);
            if(fromCurrency && toCurrency){
                
        		var currencyEx = `${fromCurrency.toUpperCase()}_${toCurrency.toUpperCase()}`;
                console.log(currencyEx);
                //Service call to get currency exchange rates
                request(`https://free.currencyconverterapi.com/api/v5/convert?q=${currencyEx}&compact=ultra`
                    , { json: true }
                    , (err, res, body) => {
                      console.log("got Response");
                      if (err) {    
                          console.log(err);               
                          reject(err); 
                       }
                     
                     console.log(body);
                     var exchangeRate = body[currencyEx];
                     console.log(exchangeRate);
                     
                     //Validate result
                     if(!exchangeRate && Object.keys(exchangeRate).length === 0 && exchangeRate.constructor === Object){                                      
                         console.log('Invalid request data');
                         reject('Invalid request data');
                     }else{
                         console.log(exchangeRate);
                         resolve(exchangeRate);
                     }                
                });
            }else{
                reject('Empty Parameters');
            }
        });
      }        
}