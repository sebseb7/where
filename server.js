#!/usr/bin/env node
'use strict';

var net = require('net');
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('track.db');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

//db.serialize(function() {
//	db.run("CREATE TABLE track (packetid INTEGER PRIMARY KEY AUTOINCREMENT,trackerid INTEGER,time TEXT,lat REAL,long REAL,speed INTEGER,heading INTEGER,altitude INTEGER,satnum INTEGER,eventid INTEGER)");
//});

net.createServer(function (socket) {

	console.log("tracker connected");

	socket.on('data', function (data) {
				
		var tokens = data.toString().replace(/^\s+|\s+$/g, '').split(/\s+/g);

		console.log(tokens.length);
		for(var x = 0; x < tokens.length; x++){
		
			console.log(tokens[x]);

			var fields = tokens[x].split(/,/g);
			console.log(fields.length);

			if((fields.length == 9)&&(fields[0] == "1000000001"))
			{
				db.serialize(function() {
			
					db.run("INSERT INTO track (trackerid,time,lat,long,speed,heading,altitude,satnum,eventid) VALUES (?,?,?,?,?,?,?,?,?)",0,fields[1],fields[2],fields[3],fields[4],fields[5],fields[6],fields[7],fields[8]);
				
				});
						
				io.emit('pos',{lat: fields[2],lon: fields[3],head: fields[5],speed: fields[4],info:fields[1]+"<br/>EV:"+fields[8]+" SAT:"+fields[7]+" SPEED:"+fields[4]});
			};
		}
	});

}).listen(8099);

console.log("start");

app.get('/', function(req, res){
	res.sendFile('index.html', { root: __dirname });
});


io.on('connection', function(socket){

	socket.on('load', function(msg){
	
		if(msg)
		{
			db.each("SELECT time,lat,long,speed,heading,satnum,eventid FROM track WHERE satnum > 5 ORDER BY packetid DESC LIMIT ?",msg, function(err, pos) {
				io.emit('pos',{lat: pos.lat,lon: pos.long,head: pos.heading,speed: pos.speed,info:pos.time+"<br/>EV:"+pos.eventid+" SAT:"+pos.satnum+" SPEED:"+pos.speed});
			});
		}
	
	});

	db.each("SELECT time,lat,long,speed,heading,satnum,eventid FROM track WHERE satnum > 6 ORDER BY packetid DESC LIMIT 1", function(err, pos) {
		io.emit('pos',{lat: pos.lat,lon: pos.long,head: pos.heading,speed: pos.speed,info:pos.time+"<br/>EV:"+pos.eventid+" SAT:"+pos.satnum+" SPEED:"+pos.speed});
	});
	db.each("SELECT time,lat,long,speed,heading,satnum,eventid FROM track ORDER BY packetid DESC LIMIT 1", function(err, pos) {
		io.emit('pos',{lat: pos.lat,lon: pos.long,head: pos.heading,speed: pos.speed,info:pos.time+"<br/>EV:"+pos.eventid+" SAT:"+pos.satnum+" SPEED:"+pos.speed});
	});
	
	console.log("browser connected");
});

http.listen(3000,'::');

