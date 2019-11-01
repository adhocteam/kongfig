import expect from 'expect.js';
import path from 'path';

jest.mock('fs');
import fs from 'fs';

jest.mock('../src/environment');
import lookUpEnvironmentVar from '../src/environment';

import { 
  configLoader,
  log,
  sanitizeConfigForSafeWrite,
} from '../src/configLoader';

const realFs = jest.requireActual('fs');
const rawYamlConfig = realFs.readFileSync(path.join(__dirname, 'files/configLoader.yml'), 'utf8');
const rawJsonConfig = realFs.readFileSync(path.join(__dirname, 'files/configLoader.json'), 'utf8');

describe('configLoader module', () => {
  afterEach(() => {
    lookUpEnvironmentVar.mockClear();
  });

  describe('configLoader', () => {
    beforeAll(() => {
      lookUpEnvironmentVar.mockImplementation(variableName => process.env[variableName]);
      fs.readFileSync.mockImplementation(filePath => {
        if(/(\.yml)|(\.yaml)/.test(filePath)) {
          return rawYamlConfig;
        } else if (/(\.json)/.test(filePath)) {
          return rawJsonConfig;
        }
        return '';
      });

      // define valid env variables in the config file
      process.env.MY_BIG_SECRET = 'no one can know';
      process.env.NOUN_1 = 'excess';
      process.env.NOUN_2 = 'riches';

      // suppress console error output: .red isn't defined, so these aren't useful
      jest.spyOn(log, 'error').mockImplementation(() => {});
    });

    beforeEach(() => {
      fs.existsSync.mockReturnValue(true);
    });

    describe('file errors', () => {
      it('should throw if the file does not exist', () => {
        fs.existsSync.mockReturnValue(false);
        expect(() => {
          configLoader('./myConfig.yml');
        }).to.throwException("Supplied --path './myConfig.yml' doesn't exist");
      });

      it('should throw if the file is in an unsupported format', () => {
        expect(() => {
          configLoader('myConfig.js');
        }).to.throwException("myConfig.js is not a supported Kongfig config format");
      });
    });

    describe('supported formats', () => {
      it('should load YAML config files', () => {
        let config;
        ['config.yml', 'config.yaml'].forEach(filename => {
          expect(() => {
            config = configLoader('config.yml');
          }).not.to.throwException();

          expect('my_yaml_config' in config).to.be.ok();
          expect(config.my_yaml_config.property).to.be('value');
        });
      });

      it('should load JSON config files', () => {
        let config;
        expect(() => {
          config = configLoader('config.json');
        }).not.to.throwException();
        
        expect('myJsonConfig' in config).to.be.ok();
        expect(config.myJsonConfig.property).to.be('value');
      });
    });

    describe('compiling config', () => {
      it("should not modify values with no templated variables", () => {
        const config = configLoader('config.yml');
        expect(config.my_yaml_config.property).to.be('value');
      });

      it("shouldn't accidentally use other variable formats", () => {
        const config = configLoader('config.yml');
        [
          "$$$_FAKE_VAR_$$$ is the old format",
          "#{} isn't right either",
        ].forEach(sampleValue => {
          expect(config.my_yaml_config.bad_var_formats.includes(sampleValue)).to.be.ok();
        });
      });

      it("shouldn't try to perform a string replace on non-string types", () => {
        const config = configLoader('config.yml');
        [
          100,
          12.8,
          true,
        ].forEach(sampleValue => {
          expect(config.my_yaml_config.non_strings.includes(sampleValue)).to.be.ok();
        });
      });

      it('should get the value of the environment variable from lookupEnvironmentVar', () => {
        configLoader('config.yml');
        expect(lookUpEnvironmentVar.mock.calls.length).to.be(3);
        
        const substitutedVars = ['MY_BIG_SECRET', 'NOUN_1', 'NOUN_2'];
        substitutedVars.forEach((variableName, index) => {
          expect(lookUpEnvironmentVar.mock.calls[index][0]).to.be(variableName);
        });
      });

      it('should replace valid defined environment variables', () => {
        const config = configLoader('config.yml');
        expect(config.my_yaml_config.my_secret_key).to.be('Key: no one can know');
      });

      it("should handle multiple values in one config value (avoid greedy matching errors)", () => {
        let config;
        expect(() => {
          config = configLoader('config.yml');
        }).not.to.throwException();

        expect(config.my_yaml_config.dont_be_greedy)
          .to.be('two env variables??? an excess of riches');
      });
    });
  });

  describe('sanitizeConfigForSafeWrite', () => {
    it('should return the config if the original and updated configs are identical', () => {
      const plainConfig = { foo: 'bar' };
      expect(sanitizeConfigForSafeWrite(plainConfig, plainConfig)).to.equal(plainConfig);
    });
  });
});