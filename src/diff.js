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

  return JSON.stringify(a) !== JSON.stringify(b);
}

export const bidirDiff = (defined, server) => {
  const allKeys = [...Object.keys(defined), ...Object.keys(server)];
  const uniqueKeys = [...new Set(allKeys)];
  return uniqueKeys.filter((key) => {
    if (isValueDifferent(defined[key], server[key])) {
      return true;
    }

    return false;
  });
}

export const diff = (defined = {}, server = {}) => {
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
