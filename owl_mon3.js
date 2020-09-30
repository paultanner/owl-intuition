/*
owl monitor - listens to UDP multicast and posts results to mysql
this is an alternative to using the data and visualisation that owl provides
this version does not produce accumulated or incremental energy traces (needed for energy viualisation)
(to do that we need to get previous values on startup)
*/
var dgram = require("dgram");
var socket = dgram.createSocket("udp4");
var request=require('request');
var parseString = require('xml2js').parseString;
var moment = require('moment');
var mysql = require('mysql');
var connection = mysql.createConnection({
  host     : '127.0.0.1',
  user     : 'owl',
  password : 'your password here',
  database : 'owl'
});

// sone of these vars are only needed to get accumulated energy
var UsagePower,UsageEnergy,GenerationPower,GenerationEnergy;
var ExportPower, ExportEnergy, ImportPower, ImportEnergy;
var UsageEnergyInc, GenerationEnergyInc, ExportEnergyInc, ImportEnergyInc;
var UsageEnergyLast=0, GenerationEnergyLast=0, ExportEnergyLast=0;
var UsageEnergyRead, GenerationEnergyRead, ExportEnergyRead;
var HeatingReq,HeatingTemp,HotWaterReq,HotWaterTemp,AmbientTemp,AmbientText;
var last_time;
var headers;

socket.on("message", function (res, rinfo) {
  var xml=''+res;
  if (xml.indexOf("whatever") !== -1) console.log("xml",xml);
  xml=xml.replace('6<curr','6</curr').replace('0<block','0</block');
  parseString(xml, function (err, result) {
    if (err) console.log("parse error",err,xml);
    //console.dir(result);
    if (result.electricity) {
      var now=new Date().getTime();  // only needed to calculate energy
      var delta_hrs=(now-last_time)/1000/60/60;
      last_time=now;
      try {
        //UsagePower=parseFloat(result.electricity.chan[0].curr[0]._);
        UsagePower=parseFloat(result.electricity.chan[0].curr[0]._);
        //UsageEnergyRead=parseFloat(result.electricity.chan[0].day[0]._);
        UsageEnergyRead=parseFloat(result.electricity.chan[0].day[0]._);
      } catch (err) {
        console.log("result.electricity error",JSON.stringify(result.electricity));
      }
      if (UsageEnergyLast === 0) UsageEnergyLast=UsageEnergyRead; 
      UsageEnergyInc=(UsageEnergyRead > UsageEnergyLast)?UsageEnergyRead-UsageEnergyLast:UsageEnergyRead;
      UsageEnergyLast=UsageEnergyRead;
      try {
        GenerationPower=result.electricity.chan[1].curr[0]._;
        GenerationEnergyRead=parseFloat(result.electricity.chan[1].day[0]._);
      } catch (err) {
        console.log("result.electricity error",JSON.stringify(result.electricity));
      }
      if (GenerationEnergyLast === 0) GenerationEnergyLast=GenerationEnergyRead; 
      GenerationEnergyInc=(GenerationEnergyRead >= GenerationEnergyLast)?GenerationEnergyRead-GenerationEnergyLast:GenerationEnergyRead;
      GenerationEnergyLast=GenerationEnergyRead;
    } else if (result.solar) {
      ExportPower=parseFloat(result.solar.current[0].exporting[0]._);
      ExportEnergyRead=parseFloat(result.solar.day[0].exported[0]._);
      if (ExportEnergyLast === 0) ExportEnergyLast=ExportEnergyRead; 
      ExportEnergyInc=(ExportEnergyRead >= ExportEnergyLast)?ExportEnergyRead-ExportEnergyLast:ExportEnergyRead;
      ExportEnergyLast=ExportEnergyRead;
      ImportPower=parseFloat(UsagePower)+parseFloat(ExportPower)-parseFloat(GenerationPower);
      if (ImportPower < 0) ImportPower=0;
      ImportEnergyInc=parseFloat(UsageEnergyInc)+parseFloat(ExportEnergyInc)-parseFloat(GenerationEnergyInc);
      if (ImportEnergyInc < 0) ImportEnergyInc=0;
      UsageEnergy+=UsageEnergyInc;
      GenerationEnergy+=GenerationEnergyInc;
      ExportEnergy+=ExportEnergyInc;
      ImportEnergy+=ImportEnergyInc;
    } else if (result.heating) {
			// VERY WIERD XML conversion - everything is an array
			HeatingTemp=parseFloat(result.heating.zones[0].zone[0].temperature[0].current[0]);			
    } else if (result.hot_water) {
			// could wait until all 6 values available
	    HotWaterTemp=parseFloat(result.hot_water.zones[0].zone[0].temperature[0].current[0]);
			AmbientTemp=parseFloat(result.hot_water.zones[0].zone[0].temperature[0].ambient[0]);
      console.log('UsagePower',UsagePower,'GenerationPower',GenerationPower,'ExportPower',ExportPower);
      console.log('AmbientTemp',AmbientTemp,'HeatingTemp',HeatingTemp,'HotWaterTemp',HotWaterTemp);

			sql = "INSERT INTO owl_log (`tstamp`,`UsagePower`,`GenerationPower`,`ExportPower`,`AmbientTemp`,`HeatingTemp`,`HotWaterTemp`) VALUES (?,?,?,?,?,?,?)";
			inserts=[moment().format(),UsagePower,GenerationPower,ExportPower,AmbientTemp,HeatingTemp,HotWaterTemp];
			sql =  mysql.format(sql,inserts);
			//console.log(sql);
			connection.query(sql, function (error, results, fields) {
			  if (error) throw error;
			  if (results.affectedRows !== 1) console.log('response:', JSON.stringify(results));
			});
			
 } else if (result.heating) {
      try {
        HeatingReq=result.heating.zones[0].zone[0].temperature[0].required[0];
        HeatingTemp=result.heating.zones[0].zone[0].temperature[0].current[0];
      } catch (err) {
        console.log("result.heating error",JSON.stringify(result.heating));
      }
    } else if (result.hot_water) {
      try {
        HotWaterReq=result.hot_water.zones[0].zone[0].temperature[0].required[0];
        HotWaterTemp=result.hot_water.zones[0].zone[0].temperature[0].current[0];
      } catch (err) {
        console.log("result.hot_water error",JSON.stringify(result.hot_water));
      }
    } else if (result.Ambient) {
      try {
        AmbientTemp=result.Ambient.temperature[0];
        AmbientText=result.Ambient.text[0];
      } catch (err) {
        console.log("result.Ambient error",JSON.stringify(result.Ambient));
      }
    } else if (result.relays) {
      // ignore relays
    } else console.log("no match for packet",JSON.stringify(result));
  });
});

//console.log("getting initial energy values");

socket.on("listening", function () {
	try {
    var address = socket.address();
    console.log("socket listening on " + address.address + ":" + address.port);
    this.addMembership('224.192.32.19');
  } catch (err) {console.log('error from socket',err);}
});

socket.bind(22600);
