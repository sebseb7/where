#!/usr/bin/env node
'use strict';

var net = require('net');
var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('track.db');
var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);


//$WP+COMMTYPE=0000,4,,,<apn>,,,<ip/host>,<port>,0,<dns>
//$WP+TRACK=0000,9,120,150,0,1,4,15
//$WP+GBLAC=0000,1 
//$WP+LOWBATT=0000,2


// http://www.open-electronics.org/celltrack/celltxt.php?hex=1&mcc=262&mnc=07&lac=4F71&cid=5B0A&lac0=4F71&cid0=0CEA&lac1=4F71&cid1=DE14&lac2=&cid2=&lac3=&cid3=&lac4=&cid4=
// 
//db.serialize(function() {
//  db.run("CREATE TABLE event (packetid INTEGER PRIMARY KEY AUTOINCREMENT,trackerid INTEGER,time INTEGER NOT NULL DEFAULT (strftime(\'%s\',\'now\')),event INTEGER)");
//	db.run("CREATE TABLE batt  (packetid INTEGER PRIMARY KEY AUTOINCREMENT,trackerid INTEGER,time INTEGER NOT NULL DEFAULT (strftime(\'%s\',\'now\')),data TEXT,voltage REAL,charging INTEGER)");
//	db.run("CREATE TABLE bts   (packetid INTEGER PRIMARY KEY AUTOINCREMENT,trackerid INTEGER,time INTEGER NOT NULL DEFAULT (strftime(\'%s\',\'now\')),dev_time TEXT,data TEXT)");
//	db.run("CREATE TABLE track (packetid INTEGER PRIMARY KEY AUTOINCREMENT,trackerid INTEGER,time INTEGER NOT NULL DEFAULT (strftime(\'%s\',\'now\')),dev_time TEXT,lat REAL,long REAL,speed INTEGER,heading INTEGER,altitude INTEGER,satnum INTEGER,eventid INTEGER,mileage INTEGER)");
//});
// 40 lowbatt
// 37 pd
// 34 wakeup

var once = true;
var track_mode = 'still';
var track_mode_curr;

net.createServer(function (socket) {

	console.log("tracker connected");
		
	if(once)
	{
		once = false;
	
		//socket.write("$WP+TRACK=0000,9,30,150,0,1,4,15\n");//<-car
		//socket.write("$WP+TRACK=0000,9,30,100,0,1,4,40\n");//<-foot
		//socket.write("$WP+TRACK=0000,4,300,100,0,1,4,70\n");//<-still
		//socket.write("$WP+GSMINFO=0000\n");
		//socket.write("$WP+TEST=0000\n");
		//300(5) nach stillstand,aller 900(15) wieder
		//socket.write("$WP+PSM=0000,1,300,1,2,2,3600\n");//GPRS active
		//socket.write("$WP+PSM=0000,2,300,1,2,2,900\n");//GPRS off
		//socket.write("$WP+PSM=0000,4,300,1,3,3,3600\n");//GSM off <--
		//socket.write("$WP+IDLESET=0000,30,10\n");
		//socket.write("$WP+PSM=0000,0\n");//poweron
		//socket.write("$WP+SETMILE=0000,1,0\n");
		//socket.write("$WP+GETLOCATION=0000\n");
		//socket.write("$WP+REBOOT=0000\n");
	};

	var timer1;

	function test()
	{
		socket.write("$WP+TEST=0000\n");
		console.log("reg batt");
		timer1 = setTimeout(test, 10*60*1000);
	}

	test();


	socket.on('close', function () {
		console.log("tracker gone");
		if(timer1)
		{
			clearTimeout(timer1);
		}
	});

	socket.on('error', function(err) {
		console.log("tracker err");
	});
	
	socket.on('data', function (data) {

		if(track_mode != track_mode_curr)
		{
			track_mode_curr = track_mode;
			if(track_mode == 'still')
			{
				socket.write("$WP+TRACK=0000,4,300,100,0,1,4,70\n");//<-still
				console.log("switch to still");
			}
			if(track_mode == 'foot')
			{
				socket.write("$WP+TRACK=0000,9,30,100,0,1,4,40\n");//<-foot
				console.log("switch to foot");
			}
			if(track_mode == 'car')
			{
				socket.write("$WP+TRACK=0000,9,30,150,0,1,4,15\n");//<-car
				console.log("switch to car");
			}
		}


		var tokens = data.toString().replace(/^\s+|\s+$/g, '').split(/\s+/g);

		console.log(tokens.length);
		for(var x = 0; x < tokens.length; x++){
		
			console.log(tokens[x]);

			var fields = tokens[x].split(/,/g);
			console.log(fields.length);

			if((fields.length == 10)&&(fields[0] == "1000000001"))
			{
				if( (fields[3] < 70)&&(fields[3] >30)&&(fields[2] < 45)&&( fields[2] > -14)&&(fields[2] != 0))
				{
					db.get("SELECT avg(speed) as avg FROM track2 WHERE time > strftime(\'%s\',\'now\')-(10*60)",function(err2,row2) {
						if(row2.avg > 2)
						{
							if(track_mode == 'still')
							{
								track_mode = 'foot';
							}
						}
						if(row2.avg > 7)
						{
							track_mode = 'car';
						}
						if(row2.avg == 0)
						{
							track_mode = 'still';
						}
						db.run("INSERT INTO track2 (trackerid,dev_time,lat,long,speed,heading,altitude,satnum,eventid,mileage,avg_speed_10) VALUES (?,?,?,?,?,?,?,?,?,?,?)",0,fields[1],fields[2],fields[3],fields[4],fields[5],fields[6],fields[7],fields[8],parseInt(fields[9]*1000),row2.avg);
					});
					if(fields[4] > 10)
					{
						track_mode='car';
					}
						
					io.emit('pos',{lat: fields[2],lon: fields[3],head: fields[5],speed: fields[4],info:fields[1]+"<br/>MD:"+track_mode+" EV:"+fields[8]+" SAT:"+fields[7]+" SPEED:"+fields[4]});
				}
				else
				{
					console.log("do not log");
				}
				if(fields[8] != 2)
				{
					db.serialize(function() {
						db.run("INSERT INTO event (trackerid,event) VALUES (?,?)",0,fields[8]);
					});
				}
				if(fields[8] == 34)
				{
					if(track_mode == 'still')
					{
						track_mode='foot';
					}
				}
			};

			if((fields.length == 3)&&(fields[0] == "$MSG:GBLAC=1000000001"))
			{
				db.serialize(function() {
			
					db.run("INSERT INTO bts (trackerid,dev_time,data) VALUES (?,?,?)",0,fields[1],fields[2]);
				
				});
			}
			
			if((fields.length == 3)&&(fields[0] == "$OK:TEST=0"))
			{
				db.serialize(function() {
			
					db.run("INSERT INTO batt (trackerid,data) VALUES (?,?)",0,fields[1]);
				
				});
			}
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
			db.each("SELECT * FROM (SELECT packetid,datetime(time, 'unixepoch', 'localtime') as ltime,lat,long,speed,heading,satnum,eventid FROM track2 WHERE ((satnum > 5)and( speed>2)) ORDER BY packetid DESC LIMIT ? ) ORDER BY packetid ASC;",msg, function(err, pos) {
				io.emit('pos',{lat: pos.lat,lon: pos.long,head: pos.heading,speed: pos.speed,info:pos.ltime+"<br/>EV:"+pos.eventid+" SAT:"+pos.satnum+" SPEED:"+pos.speed});
			});
		}
	
	});

	db.each("SELECT datetime(time, 'unixepoch', 'localtime') as ltime,lat,long,speed,heading,satnum,eventid FROM track2 WHERE satnum > 6 ORDER BY packetid DESC LIMIT 1", function(err, pos) {
		io.emit('pos',{lat: pos.lat,lon: pos.long,head: pos.heading,speed: pos.speed,info:pos.ltime+"<br/>EV:"+pos.eventid+" SAT:"+pos.satnum+" SPEED:"+pos.speed});
	});
	db.each("SELECT datetime(time, 'unixepoch', 'localtime') as ltime,lat,long,speed,heading,satnum,eventid FROM track2 ORDER BY packetid DESC LIMIT 1", function(err, pos) {
		io.emit('pos',{lat: pos.lat,lon: pos.long,head: pos.heading,speed: pos.speed,info:pos.ltime+"<br/>EV:"+pos.eventid+" SAT:"+pos.satnum+" SPEED:"+pos.speed});
	});
	
	console.log("browser connected");
});

http.listen(3000,'::');

