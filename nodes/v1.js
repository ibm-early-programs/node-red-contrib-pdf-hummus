/**
 * Copyright 2017 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
  var fs = require('fs'),
    temp = require('temp');

  var hummus = require('hummus');
  var _ = require('lodash');
  var extractText = require('./lib/text-extraction');

  temp.track();

  function verifyPayload(msg) {
    if (!msg.payload) {
      return Promise.reject('Missing property: msg.payload');
    } else if (msg.payload instanceof Buffer) {
            return Promise.resolve();
    } else {
      return Promise.reject('msg.payload should be pdf buffer');
    }
  }

  function openTheFile() {
    var p = new Promise(function resolver(resolve, reject){
      temp.open({
        suffix: '.pdf'
      }, function(err, info) {
        if (err) {
          reject('Error receiving the data buffer');
        } else {
          resolve(info);
        }
      });
    });
    return p;
  }

  function syncTheFile(info, msg) {
    var p = new Promise(function resolver(resolve, reject){
      fs.writeFile(info.path, msg.payload, function(err) {
        if (err) {
          reject('Error processing pdf buffer');
        }
        resolve();
      });
    });
    return p;
  }

  function createStream(info) {
    var theStream = hummus.createReader(info.path);
    return Promise.resolve(theStream);
  }

  function processPDF(theStream) {
    var p = new Promise(function resolver(resolve, reject) {
      var pagesPlacements = extractText(theStream);
      resolve(pagesPlacements);
    });
    return p;
  }

  function createResponse(pages) {
    var p = new Promise(function resolver(resolve, reject) {
      var textPages = [];
      var pageText = '';

      for (var i=0;i < pages.length; ++i) {
        pageText = '';
        pages[i].forEach(function(element) {
          pageText += element.text;
        });
        textPages.push(pageText);
      }
      resolve(textPages);
    });
    return p;
  }

  function sendPayloads(node, msg, textPages) {
    var p = new Promise(function resolver(resolve, reject) {
      msg.payload = 'hang in there - 001';

      textPages.forEach(function(element) {
        msg.payload = element;
        node.send(msg);
      });

      resolve();
    });
    return p;
  }

  function doSomething() {
    var p = new Promise(function resolver(resolve, reject) {
      reject('nothing yet implemented');
    });
    return p;
  }


  function reportError(node, msg, err) {
    var messageTxt = err;
    //if (err.code && 'ENOENT' === err.code) {
    //  messageTxt = 'Invalid File Path';
    //}
    if (err.error) {
      messageTxt = err.error;
    } else if (err.description) {
      messageTxt = err.description;
    } else if (err.message) {
      messageTxt = err.message;
    }
    node.status({
      fill: 'red',
      shape: 'dot',
      text: messageTxt
    });

    msg.result = {};
    msg.result['error'] = err;
    node.error(messageTxt, msg);
  }

  function Node(config) {
    var node = this;
    RED.nodes.createNode(this, config);

    this.on('input', function(msg) {
      //var message = '';
      node.status({
        fill: 'blue',
        shape: 'dot',
        text: 'loading file'
      });

      var fileInfo = null;

      verifyPayload(msg)
        .then(function() {
          return openTheFile();
        })
        .then(function(info){
          fileInfo = info;
          return syncTheFile(fileInfo, msg);
        })
        .then(function(){
          return createStream(fileInfo);
        })
        .then(function(theStream){
          node.status({
            fill: 'blue',
            shape: 'dot',
            text: 'processing file'
          });
          return processPDF(theStream);
        })
        .then(function(pages){
          return createResponse(pages);
        })
        .then(function(textPages){
          return sendPayloads(node, msg, textPages);
        })
        .then(function() {
          temp.cleanup();
          node.status({});
          //node.send(msg);
        })
        .catch(function(err) {
          temp.cleanup();
          reportError(node,msg,err);
          node.send(msg);
        });

    });
  }

  RED.nodes.registerType('pdf-hummus', Node, {
    credentials: {
      token: {
        type: 'text'
      }
    }
  });
};
