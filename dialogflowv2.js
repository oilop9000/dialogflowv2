var _ = require('underscore');
var utils = require('./lib/helpers/utils');
var lcd = require('./lib/helpers/lcd');
var dialogflow = require('dialogflow');
const {struct} = require('pb-util');
var when = utils.when;

module.exports = function(RED) {

  function DialogflowV2(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.dialogflow = config.dialogflow;
    node.language = config.language;
    node.debug = config.debug;
    node.queryParamsOK = config.queryParamsOK;

    this.on('input', function (msg) {
      var dialogFlowNode = RED.nodes.getNode(node.dialogflow);
      var language = utils.extractValue('string', 'language', node, msg, true);
      var queryParamsOK = utils.extractValue('boolean', 'queryParamsOK', node, msg, true);
      var debug = utils.extractValue('boolean', 'debug', node, msg, true);

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
      if(msg.event)
      {
        eventIn = {
          name: msg.event.name,
          parameters: struct.encode(msg.event.parameters),
          languageCode: (msg.event.languageCode)?msg.event.languageCode.toLowerCase():language.toLowerCase()
        }
      }

      var request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: msg.payload.text,
            languageCode: language.toLowerCase()
          },
          event: eventIn
        }
      };

      if(queryParamsOK)
      {
        if(msg.queryParams.payload)
          msg.queryParams.payload = struct.encode(msg.queryParams.payload);

        request.queryParams = msg.queryParams;
        //{source:"DIALOGFLOW_CONSOLE",timeZone:"America/Sao_Paulo",resetContexts:true,sentimentAnalysisRequestConfig:{analyzeQueryTextSentiment:true}}
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

  RED.nodes.registerType('dialogflowv2', DialogflowV2);

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
