'use strict';

const expect = require('chai').expect;
const sinon = require('sinon');
const path = require('path');
const AwsInvoke = require('./index');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const BbPromise = require('bluebird');
const testUtils = require('../../../../tests/utils');
const _ = require('lodash');

describe('AwsInvoke', () => {
  const serverless = new Serverless();
  serverless.setProvider('aws', new AwsProvider(serverless));
  const options = {
    stage: 'dev',
    region: 'us-east-1',
    function: 'first',
  };
  const awsInvoke = new AwsInvoke(serverless, options);

  describe('#constructor()', () => {
    it('should have hooks', () => expect(awsInvoke.hooks).to.be.not.empty);

    it('should set the provider variable to an instance of AwsProvider',
      () => expect(awsInvoke.provider).to.be.instanceof(AwsProvider));

    it('should run promise chain in order', () => {
      const validateStub = sinon
        .stub(awsInvoke, 'extendedValidate').returns(BbPromise.resolve());
      const invokeStub = sinon
        .stub(awsInvoke, 'invoke').returns(BbPromise.resolve());
      const logStub = sinon
        .stub(awsInvoke, 'log').returns(BbPromise.resolve());

      return awsInvoke.hooks['invoke:invoke']().then(() => {
        expect(validateStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledAfter(validateStub)).to.be.equal(true);
        expect(logStub.calledAfter(invokeStub)).to.be.equal(true);

        awsInvoke.extendedValidate.restore();
        awsInvoke.invoke.restore();
        awsInvoke.log.restore();
      });
    });

    it('should set an empty options object if no options are given', () => {
      const awsInvokeWithEmptyOptions = new AwsInvoke(serverless);

      expect(awsInvokeWithEmptyOptions.options).to.deep.equal({});
    });
  });

  describe('#extendedValidate()', () => {
    beforeEach(() => {
      serverless.config.servicePath = true;
      serverless.service.environment = {
        vars: {},
        stages: {
          dev: {
            vars: {},
            regions: {
              'us-east-1': {
                vars: {},
              },
            },
          },
        },
      };
      serverless.service.functions = {
        first: {
          handler: true,
        },
      };
      awsInvoke.options.data = null;
      awsInvoke.options.path = false;
    });

    it('it should throw error if function is not provided', () => {
      serverless.service.functions = null;
      expect(() => awsInvoke.extendedValidate()).to.throw(Error);
    });

    it('should not throw error when there are no input data', () => {
      awsInvoke.options.data = undefined;

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.equal('');
      });
    });

    it('should keep data if it is a simple string', () => {
      awsInvoke.options.data = 'simple-string';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.equal('simple-string');
      });
    });

    it('should parse data if it is a json string', () => {
      awsInvoke.options.data = '{"key": "value"}';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal({ key: 'value' });
      });
    });

    it('it should parse file if relative file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.json'), JSON.stringify(data));
      awsInvoke.options.path = 'data.json';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal(data);
      });
    });

    it('it should parse file if absolute file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = {
        testProp: 'testValue',
      };
      const dataFile = path.join(serverless.config.servicePath, 'data.json');
      serverless.utils.writeFileSync(dataFile, JSON.stringify(data));
      awsInvoke.options.path = dataFile;

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal(data);
      });
    });

    it('it should parse a yaml file if file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const yamlContent = 'testProp: testValue';

      serverless.utils.writeFileSync(path
        .join(serverless.config.servicePath, 'data.yml'), yamlContent);
      awsInvoke.options.path = 'data.yml';

      return awsInvoke.extendedValidate().then(() => {
        expect(awsInvoke.options.data).to.deep.equal({
          testProp: 'testValue',
        });
      });
    });

    it('it should throw error if service path is not set', () => {
      serverless.config.servicePath = false;
      expect(() => awsInvoke.extendedValidate()).to.throw(Error);
    });

    it('it should throw error if file path does not exist', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      awsInvoke.options.path = 'some/path';

      return awsInvoke.extendedValidate().catch((err) => {
        expect(err).to.be.an.instanceOf(Error);
        expect(err.message).to.equal('The file you provided does not exist.');
      });
    });

    it('should resolve if path is not given', (done) => {
      awsInvoke.options.path = false;

      awsInvoke.extendedValidate().then(() => done());
    });
  });

  describe('#invoke()', () => {
    let invokeStub;
    beforeEach(() => {
      invokeStub = sinon.stub(awsInvoke.provider, 'request').returns(BbPromise.resolve());
      awsInvoke.serverless.service.service = 'new-service';
      awsInvoke.options = {
        stage: 'dev',
        function: 'first',
        functionObj: {
          name: 'customName',
        },
      };
    });

    it('should invoke with correct params', () => awsInvoke.invoke()
      .then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledWithExactly(
          'Lambda',
          'invoke',
          {
            FunctionName: 'customName',
            InvocationType: 'RequestResponse',
            LogType: 'None',
            Payload: new Buffer(JSON.stringify({})),
          },
          awsInvoke.options.stage,
          awsInvoke.options.region
        )).to.be.equal(true);
        awsInvoke.provider.request.restore();
      })
    );

    it('should invoke and log', () => {
      awsInvoke.options.log = true;

      return awsInvoke.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledWithExactly(
          'Lambda',
          'invoke',
          {
            FunctionName: 'customName',
            InvocationType: 'RequestResponse',
            LogType: 'Tail',
            Payload: new Buffer(JSON.stringify({})),
          },
          awsInvoke.options.stage,
          awsInvoke.options.region
        )).to.be.equal(true);
        awsInvoke.provider.request.restore();
      });
    });

    it('should invoke with other invocation type', () => {
      awsInvoke.options.type = 'OtherType';

      return awsInvoke.invoke().then(() => {
        expect(invokeStub.calledOnce).to.be.equal(true);
        expect(invokeStub.calledWithExactly(
          'Lambda',
          'invoke',
          {
            FunctionName: 'customName',
            InvocationType: 'OtherType',
            LogType: 'None',
            Payload: new Buffer(JSON.stringify({})),
          },
          awsInvoke.options.stage,
          awsInvoke.options.region
        )).to.be.equal(true);
        awsInvoke.provider.request.restore();
      });
    });
  });

  describe('#log()', () => {
    beforeEach(() => {
      // Stub console.log, but only for the strings that contain "test-message"
      const realLog = console.log; // eslint-disable-line no-console
      sinon.stub(console, 'log', function (message) {
        let silence = false;
        if (typeof message === 'string') {
          if (message.includes('test-message')
            || message.includes('-------')
            || message.includes('Process exited before completing request')
          ) {
            silence = true;
          }
        }
        if (!silence) {
          realLog.apply(console, arguments);
        }
      });
    });

    afterEach(() => {
      console.log.restore(); // eslint-disable-line no-console
    });

    it('should log payload', () => {
      const invocationReplyMock = {
        Payload: `
        {
         "testProp": "test-message-payload"
        }
        `,
        LogResult: new Buffer('test-message-response').toString('base64'),
      };

      return awsInvoke.log(invocationReplyMock)
        .then(() => {
          expect(console.log.getCall(0).args[0]) // eslint-disable-line no-console
            .to.contain('"testProp": "test-message-payload"');
          expect(console.log.getCall(1).args[0]) // eslint-disable-line no-console
            .to.contain('----------');
          expect(console.log.getCall(2).args[0]) // eslint-disable-line no-console
            .to.contain('test-message-response');
        });
    });

    it('rejects the promise for failed invocations', () => {
      const invocationReplyMock = {
        Payload: `
        {
         "testProp": "test-message"
        }
        `,
        LogResult: new Buffer('test-message-response').toString('base64'),
        FunctionError: true,
      };

      return awsInvoke.log(invocationReplyMock).catch(err => {
        expect(err).to
          .and.be.instanceof(Error)
          .and.have.property('message', 'Invoked function failed');
      });
    });

    it('should color the messages', () => {
      const responseMessages = [
        'START RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2'
            + ' Version: $LATEST | test-message-1',

        '2016-07-28T13:41:55.772Z\t'
          + '8570d766-eecd-11e6-b2c6-d12ebd340be2\t'
          + 'A custom log message | test-message-2',

        'END RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2 | test-message-3',

        'REPORT RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2\t'
          + 'Duration: 256.33 ms\t'
          + 'Billed Duration: 300 ms \t'
          + 'Memory Size: 128 MB\t'
          + 'Max Memory Used: 17 MB\t'
          + '| test-message-4\t',   // Yes, they can end with tab

        'RequestId: 8570d766-eecd-11e6-b2c6-d12ebd340be2'
          + ' Process exited before completing request',
      ];
      const invocationReplyMock = {
        Payload: '"test-message-payload"',
        LogResult: new Buffer(responseMessages.join('\n')).toString('base64'),
      };

      return awsInvoke.log(invocationReplyMock)
        .then(() => {
          const messages = _.times(
            console.log.callCount, // eslint-disable-line no-console
            index => console.log.getCall(index).args[0] // eslint-disable-line no-console
          );

          // Messages
          expect(messages[0]).to.contain('"test-message-payload"');
          expect(messages[1]).to.contain('--------');
          expect(messages[2]).to.contain('test-message-1');
          expect(messages[3]).to.contain('test-message-2');
          expect(messages[4]).to.contain('test-message-3');
          expect(messages[5]).to.contain('test-message-4');
          expect(messages[6]).to.contain('Process exited before completing request');

          // Colors
          const grey = '\u001b[90m';
          const green = '\u001b[32m';
          const red = '\u001b[31m';
          expect(messages[2]).to.contain(grey);
          expect(messages[3]).to.contain(green);
          expect(messages[4]).to.contain(grey);
          expect(messages[5]).to.contain(grey);
          expect(messages[6]).to.contain(red);
        });
    });
  });
});
