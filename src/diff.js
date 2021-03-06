import isEmpty from 'lodash.isempty';

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
    if (key === 'redirect_uri') {
      // hack for >=0.8.2 that allows multiple redirect_uris,
      // but accepts a string as well
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
