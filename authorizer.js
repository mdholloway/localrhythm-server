/**
 * © 2014 michael david holloway
 */
var express = require('express');
var https = require('https');
var fs = require('fs');
var pg = require('pg');
var request = require('request');
var querystring = require('querystring');

var privKey = fs.readFileSync('MY-SSL-KEY', 'utf8');
var certificate = fs.readFileSync('MY-SSL-CERT', 'utf8');
var credentials = {key: privKey, cert: certificate};

var app = express();
var httpsServer = https.createServer(credentials, app);

var client_id = 'MY-CLIENT-ID';
var client_secret = 'MY-CLIENT-SECRET';
var callback_redirect_uri = 'MY-CALLBACK-URI';

var pg = require('pg');
var conString = "PATH-TO-MY-DATABASE";
var client = new pg.Client(conString);

var access_token;
var refresh_token;
var deviceId;

var updateDatabase = function(deviceId){
  pg.connect(conString, function(err, client, done){
	client.query('SELECT device_id FROM tokens WHERE device_id = \'' + deviceId + '\'', function(err, result){
      // add new row if device id not in database
      if (result.rows[0] == undefined || result.rows[0].device_id != deviceId) {
	    console.log('Could not find device ' + deviceId + ' in db.  Adding new row.' + '\n');
        client.query('INSERT INTO tokens VALUES (\'' + deviceId + '\', \'' + refresh_token
			+ '\', CURRENT_TIMESTAMP)', function(err, result){
	      if(err){
		    return console.error('error inserting new row for device id ' + deviceId, err);
	      }
	      console.log('ADDING NEW row for device id ' + deviceId + ' with refresh token ' + refresh_token + '\n');
		  done();
		}); // end of inner client.query block #1
      } else if (result.rows[0].device_id == deviceId){
        console.log('Found device ' + deviceId + ' in database!');
        client.query('UPDATE tokens SET refresh_token = \'' + refresh_token
		    + '\', timestamp = CURRENT_TIMESTAMP WHERE device_id = \'' + deviceId + '\'', function(err, result){
		  if(err){
		    return console.error('error updating row for device id ' + deviceId, err);
		  }
		  console.log('UPDATING row for device id ' + deviceId + ' with REFRESH TOKEN ' + refresh_token + '\n');
	      done();
	    }); //end of inner client.query block #2
      } //end of else block
    });//end of outer client.query block
  }); //end of pg.connect block
}

app.use(express.static(__dirname + '/public'))

app.get('/callback', function(req, res) {

  deviceId = req.query.uid;
  var code = req.query.code || null;

  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: callback_redirect_uri,
      grant_type: 'authorization_code'
    },
    headers: {
      'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
    },
    json: true
  };

  // request access & refresh tokens & update db when received
  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {

	  // receive new tokens from Spotify
      access_token = body.access_token,
      refresh_token = body.refresh_token;
      console.log('Got new access token and refresh token!' + '\n');

	  // send access token to Android app
	  res.send(access_token);
	  console.log('New access token ' + access_token + ' sent!' + '\n');

	  updateDatabase(deviceId);
	} else {
      res.send('invalid token!');
    }
  });
});

app.get('/refresh_token', function(req, res) {

  deviceId = req.query.uid;

  // get refresh token from db if it exists, otherwise send back null response
  pg.connect(conString, function(err, client, done){
  	if (err) {
  	  return console.error('could not connect to postgres', err);
    }
    client.query('SELECT refresh_token FROM tokens WHERE device_id = \'' + deviceId + '\'', function(err, result) {
      if (err) {
        return console.error('error running query', err);
      }
	  if (result.rows[0] == undefined) {
		res.send('nil');
	  } else {
		refresh_token = result.rows[0].refresh_token;
		console.log('FOUND refresh token ' + refresh_token + '\n');

		//if refresh token exists, send to Spotify
	    var authOptions = {
	      url: 'https://accounts.spotify.com/api/token',
	      headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
	      form: {
	        grant_type: 'refresh_token',
	        refresh_token: refresh_token
	      },
	      json: true
	    }; //end of var authOptions declaration

	    //get & return new access token
	    request.post(authOptions, function(error, response, body) {
	      if (!error && response.statusCode === 200) {
	        access_token = body.access_token;
			console.log('PASSING NEW access token ' + access_token + '\n');
	        res.send(access_token);
	      }  // end of inner 'if' block
	    });  //end of request.post(...)
	  } //end of else block
	  done();
    }); //end of client.query block
  });  //end of client.connect block
});

httpsServer.listen(8443);
console.log('Listening on 8443 (HTTPS)');
