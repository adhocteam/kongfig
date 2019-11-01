export const log = {
  info: message => console.log(message.green),
  error: message => console.error(message.red)
};

export default function lookUpEnvironmentVar(variableName) {
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