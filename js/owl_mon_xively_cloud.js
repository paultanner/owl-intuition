/*
owl_mon_xively_cloud.js
watch a port where a Network OWL is sending its data via UDP
the OWL must be configured to send to the correct server and port of course
see Settings/Set Up Data Push
this version is intentionally minimal - just electricity (power)
by paul@virtual-techno.com
open source - mit license
*/
var dgram = require("dgram");
var server = dgram.createSocket("udp4");
var request=require('request');
var parseString = require('xml2js').parseString;

var hostname='https://api.xively.com';
var feed_id=1111; // your feed id here
var key="your api key here";
var port = 9000;

server.on("error", function (err) {
  console.log("server error:\n" + err.stack);
  server.close();
});

server.on("message", function (xml, rinfo) {
  parseString(xml, function (err, result) {
    if (result.electricity) {
      var power=parseFloat(result.electricity.chan[0].curr[0]._);
      // add other channels here
      var url='/v2/feeds/'+feed_id+'.json?_method=put';
      var msg=JSON.stringify({"version":"1.0.0","datastreams":[
         {"id":"power","current_value":power}  // id will be channel name
         // add other channels here
      ]});
      headers={
        "Content-type": "application/json",
        "X-PachubeApiKey": key
      };
      request({
        method: 'POST',
        uri:  hostname + url,
        port: 443,
        body: msg,
        headers: headers,
        encoding: 'ascii'
      }, function(error,response,body) {
        if (error) console.log('error:',error);
        else console.log(new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''),"power",power,"W");
      });
    }
    // ignore other messages
  });
});

server.on("listening", function () {
  var address = server.address();
  console.log("server listening on port " + address.port);
  console.log("xively feed",feed_id);
});

server.bind(port);

