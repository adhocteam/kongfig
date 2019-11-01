import expect from 'expect.js';
import lookUpEnvironmentVar, { log } from '../src/environment';

describe('environment', () => {
  beforeAll(() => {
    // suppress console error output: .red isn't defined, so these aren't useful
    jest.spyOn(log, 'error').mockImplementation(() => {});
  });

  describe('lookUpEnvironmentVar', () => {
    it('should validate the environment variable name', () => {
      // set environment variable - don't want overlap with undefined var error
      process.env['INVALID-NAME'] = 'some value';
      expect(() => lookUpEnvironmentVar('INVALID-NAME'))
        .to.throwException("Configuration variable name INVALID-NAME is invalid");
    });

    it('should validate that the environment variable has a value', () => {
      delete process.env.FORGOT_TO_DEFINE_THIS;
      expect(() => lookUpEnvironmentVar('FORGOT_TO_DEFINE_THIS'))
        .to
        .throwException("Configuration value FORGOT_TO_DEFINE_THIS was not present in the environment.");
    });

    it('should return the environment variable if it is valid and defined', () => {
      process.env.MY_VAR = 'this is a secret - shhhhhh';
      expect(lookUpEnvironmentVar('MY_VAR')).to.be('this is a secret - shhhhhh');
    });
  });
});