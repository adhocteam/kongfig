require('isomorphic-fetch');
import SocksProxyAgent from 'socks-proxy-agent';

let headers = {};
let defaultAgent = null;

const addHeader = (name, value) => { headers[name] = value; };
const setAgent = (socks) => { defaultAgent = SocksProxyAgent(socks); };
const clearHeaders = () => { headers = {}; };

const get = (uri, agent = defaultAgent) => {
    const options = {
        method: 'GET',
        headers: {
            'Connection': 'keep-alive',
            'Accept': 'application/json'
        }
    };

    if (!defaultAgent) {
        console.log(agent);
        console.trace();
    }

    if (defaultAgent) {
        options.agent = defaultAgent;
    }

    return request(uri, options);
};

const request = (uri, opts) => {
    const requestHeaders = Object.assign(
        {},
        opts.headers,
        headers
    );

    const options = Object.assign(
        {},
        opts,
        { headers: requestHeaders }
    );

    return fetchWithRetry(uri, options);
};

function fetchWithRetry(url, options) {
    var retries = 3;
    var retryDelay = 500;

    if (options && options.retries) {
        retries = options.retries;
    }

    if (options && options.retryDelay) {
        retryDelay = options.retryDelay;
    }

    return new Promise(function(resolve, reject) {
        var wrappedFetch = (n) => {
            fetch(url, options)
                .then(response => {
                    resolve(response);
                })
                .catch(error => {
                    if (n <= retries) {
                        setTimeout(() => {
                            wrappedFetch(n + 1)
                        }, retryDelay * Math.pow(2, n));
                    } else {
                        reject(error);
                    }
                });
        };
        wrappedFetch(0);
    });
}

export default {
    addHeader,
    setAgent,
    clearHeaders,
    get,
    request
};
