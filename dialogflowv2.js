var _ = require('underscore');
var utils = require('./lib/helpers/utils');
var lcd = require('./lib/helpers/lcd');
var dialogflow = require('@google-cloud/dialogflow');
var moment = require('moment');
const {struct} = require('pb-util');
const { includes } = require('underscore');
var when = utils.when;
var jsonata = require('jsonata');

module.exports = function(RED) {

  function DialogflowV2(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.dialogflow = config.dialogflow;
    node.language = config.language;
    node.debug = config.debug;
    node.textField = config.textField;
     
    
    var indexOb = function(obj,is, value) {
      if (typeof is == 'string' )
          return indexOb(obj,is.split('.'), value);
      else if (is.length==1 && value!==undefined)
          return obj[is[0]] = value;  
      else if (is.length==0){
          return obj;
      }else{
        typeof obj[is[0]] == 'undefined'? obj[is[0]]={}:obj[is[0]];
        return indexOb(obj[is[0]],is.slice(1), value)
      }
    }  

    this.on('input', function (msg) {
      var dialogFlowNode = RED.nodes.getNode(node.dialogflow);
      var language = utils.extractValue('string', 'language', node, msg, false);
      var debug = utils.extractValue('boolean', 'debug', node, msg, false);
      var textField = utils.extractValue('string', 'textField', node, msg, false);

      
      // exit if empty credentials
      if (dialogFlowNode == null || dialogFlowNode.credentials == null) {
        lcd.warn('Dialogflow.ai credentials are missing.');
        return;
      }
      // error if no language at all
      if (_.isEmpty(language)) {
        node.error('Language param is empty in Dialogflow node');
        return;
      }
      if (_.isEmpty(textField)) {
        node.error('text field param is empty in Dialogflow node');
        return;
      }
      //Check if textField has valid chars and length
      if(textField)
      {
        if (/^[\w\d.\-]{3,40}$/m.test(textField)) {
          var text =  indexOb(msg,textField);
        } else {
        return;
        }
      }

      var email = dialogFlowNode.credentials.email;
      var privateKey = dialogFlowNode.credentials.privateKey;
      const projectId = dialogFlowNode.credentials.projectId;

      var sessionClient = new dialogflow.SessionsClient({
        credentials: {
          private_key: privateKey,
          client_email: email
        }
      });

      const sessionId = (msg.customSession)?msg.customSession:String(msg._msgid);
      var sessionPath = sessionClient.projectAgentSessionPath(projectId,sessionId);
      // var sessionPath = sessionClient.sessionPath(projectId, sessionId);

      var request = {
        session: sessionPath,
        queryInput: {
        }
      };

      if(msg.event)
        {
          request.queryInput.event = {
          name: msg.event.name,
          parameters: struct.encode(msg.event.parameters),
          languageCode: (msg.event.languageCode)?msg.event.languageCode.toLowerCase():language.toLowerCase()
        }
        //Check if given event requires context
        var expression = jsonata("intents#$i['" + msg.event.name.toUpperCase() + "' in events]");
        var result = expression.evaluate({ "intents": this.context().flow.get("intents") });
        // msg.tipo = typeof (result.inputContextNames);
        typeof (msg.queryParams) == 'undefined' ? msg.queryParams = {} : msg.queryParams;
        if (typeof(result.inputContextNames) != 'undefined'){
          //Establecer los contextos de entrada 
        var contexts = [];
            result.inputContextNames.forEach(function(element) {
                contexts.push({
                    "name": element,
                    "parameters": {},
                    "lifespanCount": 1
                });
            });
        }
        msg.queryParams.contexts = contexts; 
      }

      if(text)
      {
        request.queryInput.text =  {
          text: text,
          languageCode: language.toLowerCase()
        } 
      }

      if(msg.queryParams)
      {
        if(msg.queryParams.payload)
          msg.queryParams.payload = struct.encode(msg.queryParams.payload);
        request.queryParams = msg.queryParams;  
      }

      var body = null;
	  
	  function start (key, value) {
       var global = key+value;
        return global;
      }

      when(start('id ', msg._msgid))
      
      .then(function() {
          return sessionClient.detectIntent(request);
        })
        
        .then(function(response) {
          body = response;
          return when(msg!==null);
        })
        .then(function() {
          if (body == null || !_.isArray(body) || _.isEmpty(body)) {
            return Promise.reject('Error on api.dialogflow.com');
          }
        })
        .then(function() {
          //Result output
          msg._dialogflow = body[0].queryResult;
          //Graba el texto de salida en caso de que se reciba texto de entrada  
          indexOb(msg,textField,body[0].queryResult.fulfillmentText);
          // msg.payload = body[0].queryResult.fulfillmentText;  
          if (debug) {
            lcd.node(msg.payload, { node: node, title: 'Dialogflow-V2.com' });
          }
          node.send([msg, null]);
        })
        .catch(function(error) {
          if (error != null) {
            node.error(error, msg);
          }
        });
    });
  }

  RED.nodes.registerType('dialogflowv2', DialogflowV2);

  function DialogflowV2Intents(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.dialogflow = config.dialogflow;
    node.language = config.language;
    // node.debug = config.debug;
    // node.textField = config.textField;

    this.on('input', function (msg) {
      var dialogFlowNode = RED.nodes.getNode(node.dialogflow);
      var language = utils.extractValue('string', 'language', node, msg, false);
      
      // exit if empty credentials
      if (dialogFlowNode == null || dialogFlowNode.credentials == null) {
        lcd.warn('Dialogflow.ai credentials are missing.');
        return;
      }
      // error if no language at all
      if (_.isEmpty(language)) {
        node.error('Language param is empty in Dialogflow node');
        return;
      }

      var email = dialogFlowNode.credentials.email;
      var privateKey = dialogFlowNode.credentials.privateKey;
      var projectId = dialogFlowNode.credentials.projectId;

      var intentsClient = new dialogflow.IntentsClient({
        credentials: {
          private_key: privateKey,
          client_email: email
        }
      });

      var sessionId = (msg.customSession)?msg.customSession:String(msg._msgid);
      // var sessionPath = intentsClient.sessionPath(projectId, sessionId);

      // Iterate over all elements.
      var formattedParent = intentsClient.projectAgentPath(projectId);
      msg.projIntents = {};
      
      
      // intentsClient.listIntents({parent: formattedParent})
      //   .then(responses => {
      //     msg.projIntents = responses[0];   
      //   })
      //   .catch(err => {
      //     // console.error(err);
      //     node.error(err, msg);
      //   });
        
      // if (_.isObject(msg.projIntents) && _.isEmpty(msg.projIntents)) {
        
        
      //   node.send([msg, null]);
      // } else {
      //   node.error("No intents found", msg);
      // }
      
      var body = null;
      var cnt = 0;
      moment.locale('es-mx');         // 
      moment().format('LT');  
      
  
	  function start (key, value) {
       var global = key+value;
        return global;
      }

      when(start('id ', msg._msgid))
      .then(function() {
          return intentsClient.listIntents({parent: formattedParent});
        })
        
        .then(function(response) {
          body = response;
          return when(msg!==null);
        })
        .then(function() {
          if (body == null || !_.isArray(body) || _.isEmpty(body)) {
            return Promise.reject('Error on api.dialogflow.com');
          }
        })
        .then(function() {
          //Result output
          msg.projIntents = body[0];
          _.isArray(body[0])?cnt = body[0].length : cnt;
          node.status({fill:"green",shape:"dot",text: cnt+ " recvd -" + moment().format('LT') });
          node.send([msg, null]);
        })
        .catch(function(error) {
          if (error != null) {
            node.status({fill:"red",shape:"dot",text: error + " " + moment().format('LT') });
            node.error(error, msg);
          }
        });
    });
  }

  RED.nodes.registerType('dialogflowv2intents', DialogflowV2Intents);

  function DialogflowV2WebHook(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.dialogflow = config.dialogflow;
    node.language = config.language;
    node.debug = config.debug;
    node.queryParamsOK = config.queryParamsOK;

    this.on('input', function (msg) {
      var dialogFlowNode = RED.nodes.getNode(node.dialogflow);
      var language = utils.extractValue('string', 'language', node, msg, false);
      var queryParamsOK = utils.extractValue('boolean', 'queryParamsOK', node, msg, false);
      var debug = utils.extractValue('boolean', 'debug', node, msg, false);

      // exit if empty credentials
      if (dialogFlowNode == null || dialogFlowNode.credentials == null) {
        lcd.warn('Dialogflow.ai credentials are missing.');
        return;
      }
      // error if no language at all
      if (_.isEmpty(language)) {
        node.error('Language param is empty in Dialogflow node');
        return;
      }

      var email = dialogFlowNode.credentials.email;
      var privateKey = dialogFlowNode.credentials.privateKey;
      var projectId = dialogFlowNode.credentials.projectId;

      var sessionClient = new dialogflow.SessionsClient({
        credentials: {
          private_key: privateKey,
          client_email: email
        }
      });

      var sessionId = (msg.customSession)?msg.customSession:String(msg._msgid);
      var sessionPath = sessionClient.sessionPath(projectId, sessionId);
      var eventIn = null;
      var qInput = null;

      var request = {
        session: sessionPath,
        queryInput: {
        }
      };

      if(msg.event)
      {
        request.queryInput.event = {
          name: msg.event.name,
          parameters: struct.encode(msg.event.parameters),
          languageCode: (msg.event.languageCode)?msg.event.languageCode.toLowerCase():language.toLowerCase()
        }
      }

      if(msg.intentText)
      {
        request.queryInput.text =  {
          text: msg.intentText,
          languageCode: language.toLowerCase()
        } 
      }

      if(msg.queryParams)
      {
        if(msg.queryParams.payload)
          msg.queryParams.payload = struct.encode(msg.queryParams.payload);

        request.queryParams = msg.queryParams;        

      }

      var body = null;
	  
	  function start (key, value) {
       var global = key+value;
        return global;
      }

      when(start('id ', msg._msgid))
      
      .then(function() {
          return sessionClient.detectIntent(request);
        })
        
        .then(function(response) {
          body = response;
          return when(msg!==null);
        })
        .then(function() {
          if (body == null || !_.isArray(body) || _.isEmpty(body)) {
            return Promise.reject('Error on api.dialogflow.com');
          }
        })
        .then(function() {
          //Result output
          msg._dialogflow = body[0].queryResult;
          if (debug) {
            lcd.node(msg.payload, { node: node, title: 'Dialogflow-V2.com' });
          }
          node.send([msg, null]);
        })
        .catch(function(error) {
          if (error != null) {
            node.error(error, msg);
          }
        });
    });
  }

  RED.nodes.registerType('dialogflowv2wh', DialogflowV2WebHook);

  function DialogflowV2Token(n) {
    RED.nodes.createNode(this, n);
  }

  RED.nodes.registerType('dialogflowv2-token', DialogflowV2Token, {
    credentials: {
      email: {
        type: 'text'
      },
      privateKey: {
        type: 'text'
      },
      projectId: {
        type: 'text'
      }
    }
  });

};
