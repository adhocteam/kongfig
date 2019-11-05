import expect from 'expect.js';
import {
  lookUpEnvironmentVar,
  getEnvironmentVarPointers,
  log,
} from '../src/environment';

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

  describe("getEnvironmentVarPointers", () => {
    it("should get pointer to env variables but not pointers to regular values", () => {
      const config = {
        env: "Authorization: Basic ${MY_KEY}",
        vanilla: "plain"
      };

      const pointers = getEnvironmentVarPointers(config);
      expect(Object.keys(pointers).length).to.be(1);
      expect(pointers["/env"]).to.be("Authorization: Basic ${MY_KEY}");
    });

    it("does not include non-strings or error out when parsing them", () => {
      const config = {
        obj: {},
        arr: [],
        num: 10,
        str: "foo"
      };
      
      expect(getEnvironmentVarPointers(config)).to.eql([]);
    });

    it("handles complex/deep objects", () => {
      const config = {
        x: ["mykey: ${SECRET}", "nothing here", {
          val: "to ${REPLACE}",
          val2: "public info"
        }],
        y: {
          authRoute: "/auth/${CLIENT_SECRET}" ,
          route: "/my/fake/route"
        },
        z: "${VERY_SECRET_SECRET}",
        z1: "not secret"
      };

      const pointers = getEnvironmentVarPointers(config);
      expect(Object.keys(pointers).length).to.be(4);
      expect(pointers["/x/0"]).to.be("mykey: ${SECRET}");
      expect(pointers["/x/2/val"]).to.be("to ${REPLACE}");
      expect(pointers["/y/authRoute"]).to.be("/auth/${CLIENT_SECRET}");
      expect(pointers["/z"]).to.be("${VERY_SECRET_SECRET}");
    });
  });
});