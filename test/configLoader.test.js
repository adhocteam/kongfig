import expect from 'expect.js';
import path from 'path';

jest.mock('fs');
import fs from 'fs';

jest.mock('../src/environment');
import { getEnvironmentVarPointers, lookUpEnvironmentVar } from '../src/environment';

import { 
  configLoader,
  log,
  sanitizeConfigForSafeWrite,
} from '../src/configLoader';

const realFs = jest.requireActual('fs');
const rawYamlConfig = realFs.readFileSync(path.join(__dirname, 'files/configLoader.yml'), 'utf8');
const rawJsonConfig = realFs.readFileSync(path.join(__dirname, 'files/configLoader.json'), 'utf8');

const yamlConfigPointers = {
  "/my_yaml_config/my_secret_key": "Key: ${MY_BIG_SECRET}",
  "/my_yaml_config/dont_be_greedy": "two env variables??? an ${NOUN_1} of ${NOUN_2}",
};

describe('configLoader module', () => {
  afterEach(() => {
    lookUpEnvironmentVar.mockClear();
    getEnvironmentVarPointers.mockClear();
  });

  describe('configLoader', () => {
    beforeAll(() => {
      lookUpEnvironmentVar.mockImplementation(variableName => process.env[variableName]);
      getEnvironmentVarPointers.mockReturnValue(yamlConfigPointers);
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
            config = configLoader('config.yml')[0];
          }).not.to.throwException();

          expect('my_yaml_config' in config).to.be.ok();
          expect(config.my_yaml_config.property).to.be('value');
        });
      });

      it('should load JSON config files', () => {
        let config;
        expect(() => {
          config = configLoader('config.json')[0];
        }).not.to.throwException();
        
        expect('myJsonConfig' in config).to.be.ok();
        expect(config.myJsonConfig.property).to.be('value');
      });
    });

    describe('compiled config', () => {
      it("should not modify values with no templated variables", () => {
        const config = configLoader('config.yml')[0];
        expect(config.my_yaml_config.property).to.be('value');
      });

      it("shouldn't accidentally use other variable formats", () => {
        const config = configLoader('config.yml')[0];
        [
          "$$$_FAKE_VAR_$$$ is the old format",
          "#{} isn't right either",
        ].forEach(sampleValue => {
          expect(config.my_yaml_config.bad_var_formats.includes(sampleValue)).to.be.ok();
        });
      });

      it("shouldn't try to perform a string replace on non-string types", () => {
        const config = configLoader('config.yml')[0];
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
        const config = configLoader('config.yml')[0];
        expect(config.my_yaml_config.my_secret_key).to.be('Key: no one can know');
      });

      it("should handle multiple values in one config value (avoid greedy matching errors)", () => {
        let config;
        expect(() => {
          config = configLoader('config.yml')[0];
        }).not.to.throwException();

        expect(config.my_yaml_config.dont_be_greedy)
          .to.be('two env variables??? an excess of riches');
      });
    });

    describe("environment variable JSON pointers", () => {
      it("should return the result of getEnvironmentVarPointers", () => {
        const pointers = {
          "/foo/3/bar": "${TEST_SECRET}",
          "/x": "shhhh: ${BIG_SECRET}",
          "/12/fancy": "${DONT_WRITE_ME"
        };

        getEnvironmentVarPointers.mockReturnValue(pointers);
        const envPointers = configLoader('config.yml')[1];
        expect(envPointers).to.eql(pointers);
      });
    });
  });

  describe('sanitizeConfigForSafeWrite', () => {
    it('should not transform anything if the config has not changed', () => {
      const config = { foo: 'bar' };
      const cleanConfig = sanitizeConfigForSafeWrite(config, {});
      expect(cleanConfig).to.eql(config);
    });
    
    it('should not transform non-string values', () => {
      const config = { integer: 5, obj: {}, arr: [] };
      const cleanConfig = sanitizeConfigForSafeWrite(config, {});
      expect(cleanConfig).to.eql(config);
    });

    it('should replace secrets with their variable names in the original', () => {
      const config = { auth: 'Authorization: dontwriteme' };
      const pointers = { "/auth": "Authorization: ${SECRET}" }
      const cleanConfig = sanitizeConfigForSafeWrite(config, pointers);
      expect(cleanConfig).to.eql({ auth: "Authorization: ${SECRET}" });
    });

    it('should replace nested variables', () => {
      const config = {
        attr: { key: "dontwritemeimabigsecret" }
      };

      const pointers = {
        "/attr/key": "${MY_SECRET_KEY}"
      };

      const cleanConfig = sanitizeConfigForSafeWrite(config, pointers);
      expect(cleanConfig).to.eql({
        attr: { key: "${MY_SECRET_KEY}" }
      });
    });

    it('should replace every match in lines with multiple variables in the original', () => {
      const config = {
        lesson: 'an OAuth client needs a fakeclientid and fakeclientsecret'
      };
      const pointers = { "/lesson": "an OAuth client needs a ${CLIENT_ID} and ${CLIENT_SECRET}" };

      const cleanConfig = sanitizeConfigForSafeWrite(config, pointers);
      expect(cleanConfig).to.eql({
        lesson: 'an OAuth client needs a ${CLIENT_ID} and ${CLIENT_SECRET}'
      });
    });
  });
});