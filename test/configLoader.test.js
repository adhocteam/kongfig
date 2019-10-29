import expect from 'expect.js';
import path from 'path';
import yaml from 'js-yaml';
import { configLoader, log } from '../src/configLoader';

jest.mock('fs');
import fs from 'fs';

const realFs = jest.requireActual('fs');
const rawYamlConfig = realFs.readFileSync(path.join(__dirname, 'files/configLoader.yml'), 'utf8');
const rawJsonConfig = realFs.readFileSync(path.join(__dirname, 'files/configLoader.json'), 'utf8');

describe('configLoader', () => {
  beforeAll(() => {
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

    describe('environment variable errors', () => {
      let validConfig;
      beforeAll(() => {
        validConfig = yaml.safeLoad(rawYamlConfig);
      });

      afterEach(() => {
        jest.spyOn(yaml, 'safeLoad').mockRestore();
      });

      it('should validate the environment variable name', () => {
        const configWithError = {
          ... validConfig,
          invalid_name: 'you named this ${INVALID-NAME} - whoops!',
        };
        jest.spyOn(yaml, 'safeLoad').mockReturnValue(configWithError);

        // define the env variable - that's not the problem here
        process.env['INVALID-NAME'] = 'some value';
        expect(() => configLoader('config.yml'))
          .to.throwException("Configuration variable name INVALID-NAME is invalid");
      });

      it('should validate that the environment variable has a value', () => {
        const configWithError = {
          ... validConfig,
          undefined_var: 'uh oh, ${FORGOT_TO_DEFINE_THIS}',
        };
        jest.spyOn(yaml, 'safeLoad').mockReturnValue(configWithError);

        expect(() => configLoader('config.yml'))
          .to
          .throwException("Configuration value FORGOT_TO_DEFINE_THIS was not present in the environment.");
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