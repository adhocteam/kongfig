import isEmpty from 'lodash.isempty';

// https://github.com/Kong/kong/blob/0.14.0/kong/plugins/acl/schema.lua
const ARRAY_OR_STRING_KEYS = [
  'redirect_uri',
  'whitelist',
  'blacklist'
];

const isValueSameOneArrayElement = (a, b) => {
  return typeof a === 'string'
    && Array.isArray(b)
    && b.length === 1
    && !isValueDifferent(a, b[0]);
};

const isValueDifferent = (a, b) => {
  if (Array.isArray(a)) {
    return !Array.isArray(b)
      || a.length != b.length
      || a.filter(x => b.indexOf(x) === -1).length > 0;
  }

  if (a === null || typeof a === 'undefined') {
    return (b !== null && typeof b !== 'undefined');
  }

  // If b is an object remove any empty keys. Objects from the server
  // sometimes are populated with empty objects, which triggers a diff
  // even if there is no diff, causing confusion. In particular
  // transform-response and transform-request plugins seem to always have
  // empty objects from the server. This for loop will turn an object:
  //
  // {"querystring":{},"headers":["Authorization:Basic blah"],"body":{}}
  //
  // into:
  //
  // {"headers":["Authorization:Basic blah"]}
  for (var key in b) {
    if (b.hasOwnProperty(key)) {
      if (isEmpty(b[key])) {
        delete b[key];
      }
    }
  }

  return JSON.stringify(a) !== JSON.stringify(b);
}

export default (defined = {}, server = {}) => {
  const keys = Object.keys(defined);

  return keys.reduce((changed, key) => {
    if (ARRAY_OR_STRING_KEYS.includes(key)) {
      // hack that allows keys that can be a string
      // or array of strings,
      if (isValueSameOneArrayElement(defined[key], server[key])) {
        return changed;
      }
    }

    if (isValueDifferent(defined[key], server[key])) {
      return [...changed, key];
    }
    return changed;
  }, []);
};
