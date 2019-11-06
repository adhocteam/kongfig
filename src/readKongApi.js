import semVer from 'semver';
import kongState from './kongState';
import { parseUpstreams } from './parsers/upstreams';
import { parseCertificates } from './parsers/certificates';
import getCurrentStateSelector from './stateSelector';

export default async (adminApi, config) => {
    return Promise.all([kongState(adminApi), adminApi.fetchPluginSchemas(), adminApi.fetchKongVersion()])
        .then(([state, schemas, version]) => {
            return getCurrentStateSelector({
                _info: { version },
                services: parseServices(state.services, version, config),
                consumers: parseConsumers(state.consumers),
                plugins: parseGlobalPlugins(state.plugins, version),
                upstreams: semVer.gte(version, '0.10.0') ? parseUpstreams(state.upstreams) : undefined,
                certificates: semVer.gte(version, '0.10.0') ? parseCertificates(state.certificates) : undefined,
            });
        })
};

export const parseConsumer = ({ username, custom_id, credentials, acls, ..._info }) => {
    return {
        username,
        custom_id,
        _info,
    };
};

export const parseAcl = ({group, ..._info}) => ({group, _info});

function parseConsumers(consumers) {
    return consumers.map(({username, custom_id, credentials, acls, ..._info}) => {
        return {
            ...parseConsumer({ username, custom_id, ..._info}),
            acls: Array.isArray(acls) ? acls.map(parseAcl) : [],
            credentials: zip(Object.keys(credentials), Object.values(credentials))
                .map(parseCredential)
                .reduce((acc, x) => acc.concat(x), [])
        };
    });
}

function zip(a, b) {
    return a.map((n, index) => [n, b[index]]);
}

function parseCredential([credentialName, credentials]) {
    if (!Array.isArray(credentials)) {
      return [];
    }

    return credentials.map(({consumer_id, id, created_at, ...attributes}) => {
        return {
            name: credentialName,
            attributes,
            _info: {id, consumer_id, created_at}
        };
    });
}


export const parsePlugin = (plugin, version) => {
    const {
        name,
        config,
        id,
        enabled,
        created_at,
        ...attributes
    } = plugin

    let parsed = {
        name,
        attributes: {
            enabled,
            config: stripConfig(config),
            ...attributes
        },
        _info: {
            id,
            created_at
        }
    }
    if (semVer.gte(version, '1.0.0')) {
        parsed.attributes.consumer = plugin.consumer
        parsed._info.consumer = plugin.consumer
    } else {
        parsed._info.consumer_id = plugin.consumer_id
        parsed.attributes.consumer_id = plugin.consumer_id
    }

    return parsed
};

function parseServiceOrRoutePlugins(plugins, version) {
    if (!Array.isArray(plugins)) {
      return [];
    }

    return plugins.map(plugin => parsePlugin(plugin, version));
}

export function parseRoute({ name, id, created_at, updated_at, service, ...attributes }) {
    return { name, id, attributes: attributes, _info: { id, updated_at, created_at } };
}

function parseRoutes(routes, serviceName= '', config = {}, version) {
    return routes.map(({ plugins, ...route }) => {
        const { id, ...rest } = parseRoute(route, serviceName, config);
        return { id, plugins: parseServiceOrRoutePlugins(plugins, version), ...rest };
    });
}

export function parseService({
    name, plugins, host, connect_timeout, read_timeout,
    port, path, write_timeout, id, created_at, updated_at,
    protocol, retries }) {
    return {
        name,
        attributes: {
            host,
            port,
            protocol,
            path,
            retries,
            connect_timeout,
            read_timeout,
            write_timeout,
        },
        _info: {
            id,
            created_at,
            updated_at,
        }
    };
}

function parseServices(services, version, config = {}) {
    if (semVer.gte(version, '0.13.0')) {
        return services.map(({ plugins, routes, ...service }) => {
            const { name, ...rest } = parseService(service);
            return { name, plugins: parseServiceOrRoutePlugins(plugins, version), routes: parseRoutes(routes, name, config, version), ...rest };
        });
    }
    return [];
}

function parseGlobalPlugins(plugins, version) {
    if (!Array.isArray(plugins)) {
      return [];
    }

    return plugins
        .map(plugin => parsePlugin(plugin, version))
        .filter(x => x.name);
}

function stripConfig(config) {
    const mutableConfig = {...config};

    // remove some cache values
    delete mutableConfig['_key_der_cache'];
    delete mutableConfig['_cert_der_cache'];

    return mutableConfig;
}
