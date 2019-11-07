import jsonPointer from "json-ptr";

export const log = {
  info: message => console.log(message.green),
  error: message => console.error(message.red)
};

const ENV_VAR_REGEX = /\$\{(.+?)\}/;
export const variableRegexSource = ENV_VAR_REGEX.source;

export function lookUpEnvironmentVar(variableName) {
  const allowedNameRegex = /^[_a-zA-Z0-9]+$/;
  if (!allowedNameRegex.test(variableName)) {
      log.error(`Configuration variable name ${variableName} is invalid.\nAllowed characters are letters, numbers, and underscores.`);
      throw new Error(`Configuration variable name ${variableName} is invalid`);
  }
  
  if (process.env[variableName] === undefined) {
      log.error(`Configuration value ${variableName} was not present in the environment.`);
      throw new Error(`Configuration value ${variableName} was not present in the environment.`);
  }

  return process.env[variableName];
}

export function getEnvironmentVarPointers(config) {
  const pointers = jsonPointer.flatten(config);
  for (let ptr in pointers) {
      const value = pointers[ptr];
      if (typeof value !== "string" || !ENV_VAR_REGEX.test(value)) {
          delete pointers[ptr];
      }
  }

  return pointers;
}