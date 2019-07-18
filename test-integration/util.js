import adminApi from '../src/adminApi';
import readKongApi from '../src/readKongApi';
import execute from '../src/core';
import { logReducer } from '../src/kongStateLocal';
import getCurrentStateSelector from '../src/stateSelector';
import invariant from 'invariant';
import pad from 'pad';
import { pretty } from '../src/prettyConfig';

invariant(process.env.TEST_INTEGRATION_KONG_HOST, `
    Please set ${'TEST_INTEGRATION_KONG_HOST'.bold} env variable

    TEST_INTEGRATION_KONG_HOST=localhost:8001 yarn test

    ${'WARNING! Running integration tests are going to remove all data from the kong'.red.bold}.
`);

const UUIDRegex = /[a-f0-9]{8}-?[a-f0-9]{4}-?4[a-f0-9]{3}-?[89ab][a-f0-9]{3}-?[a-f0-9]{12}/g;
const IGNORED_KEYS = ['created_at', 'version', 'orderlist', 'updated_at']
let uuids = {};
let log = [];
let rawLog = [];

export const exportToYaml = pretty('yaml');
export const getLocalState = () => getCurrentStateSelector(rawLog.reduce(logReducer, undefined));

export const testAdminApi = adminApi({
    host: process.env.TEST_INTEGRATION_KONG_HOST,
    https: false,
    ignoreConsumers: false,
    cache: false,
});

export const getLog = () => log;
export const logger = message => {
    if (message.type === 'experimental-features') {
        // cannot include these in tests because they change based on test matrix
        return;
    }

    const m = cloneObject(message);

    if (m.hasOwnProperty('uri')) {
        m.uri = m.uri.replace(process.env.TEST_INTEGRATION_KONG_HOST, 'localhost:8001');
    }

    rawLog.push(m);
    log.push(ignoreKeys(m));
};

const _ignoreKeys = (obj) => {
    if (typeof obj !== 'object') {
        return obj;
    }

    return obj && Object.keys(obj).reduce((x, key) => {
        if (typeof obj[key] === 'string' && obj[key].match(UUIDRegex)) {
            const value = obj[key].match(UUIDRegex).reduce((value, uuid) => {
                if (!uuids.hasOwnProperty(uuid)) {
                    const id = pad(12, `${Object.keys(uuids).length + 1}`, '0');
                    uuids[uuid] = `2b47ba9b-761a-492d-9a0c-${id}`;
                }

                return value.replace(uuid, uuids[uuid]);
            }, obj[key]);

            return addElement(x, value, key);
        } else if (IGNORED_KEYS.includes(key)) {
            return addElement(x, `___${key}___`, key);
        }

        return addElement(x, _ignoreKeys(obj[key]), key);
    }, Array.isArray(obj) ? [] : {});
};

const addElement = (obj, elem, key) => {
    if (Array.isArray(obj)) {
        return [ ...obj, elem ];
    } else {
        return { ...obj, [key]: elem }
    }
}

const cloneObject = obj => JSON.parse(JSON.stringify(obj));

export const ignoreKeys = (obj) => _ignoreKeys(cloneObject(obj));

const cleanupKong = async () => {
    const results = await readKongApi(testAdminApi);
    await execute({
        apis: results.apis.map(api => ({ ...api, ensure: 'removed' })),
        consumers: results.consumers.map(consumer => ({ ...consumer, ensure: 'removed' })),
        plugins: results.plugins.map(plugin => ({ ...plugin, ensure: 'removed' })),
        upstreams: results.upstreams.map(upstream => ({ ...upstream, ensure: 'removed' })),
        certificates: results.certificates.map(certificate => ({ ...certificate, ensure: 'removed' })),
        services: results.services.map(service => ({ ...markRoutesRemoved(service), ensure: 'removed' })),
    }, testAdminApi);
};

const markRoutesRemoved = (service) => {
    return { ...service, routes: service.routes.map((route) => ({ ...route, ensure: 'removed' })) };
}

export const tearDown = async () => {
    uuids = {};
    log = [];
    rawLog = [];
    await cleanupKong();
};
