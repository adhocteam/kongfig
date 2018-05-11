import { parseService, parseRoute, parsePlugin, parseConsumer, parseAcl, parseGlobalPlugin } from '../readKongApi';

const plugins = (state, log) => {
    const { params: { type, endpoint: { params, body } }, content } = log;

    switch (type) {
    case 'add-service-plugin': return [ ...state, parsePlugin(content) ];
    case 'update-service-plugin': return state.map(state => {
        if (state._info.id !== content.id) {
            return state;
        }

        return parsePlugin(content);
    });
    case 'remove-service-plugin': return state.filter(plugin => plugin._info.id !== params.pluginId);
    default: return state;
    }
};

const service = (state, log) => {
    const { params: { type, endpoint: { params, body } }, content } = log;

    switch (type) {
    case 'create-service': return {
        ...parseService(content),
        plugins: []
    };
    case 'update-service':
        if (state._info.id !== content.id) {
            return state;
        }

        return {
            ...state,
            ...parseService(content)
        };
    case 'add-service-plugin':
    case 'update-service-plugin':
    case 'remove-service-plugin':
        if (state._info.id !== params.apiId) {
            return state;
        }

        return {
            ...state,
            plugins: plugins(state.plugins, log)
        };

    default: return state;
    }
};

export default (state = [], log) => {
    if (log.type !== 'response') {
        return state;
    }

    const { params: { type, endpoint: { params } }, content } = log;

    switch (type) {
    case 'create-service': return [...state, service(undefined, log)];
    case 'remove-service': return state.filter(service => service.name !== params.name);

    case 'update-service':
    case 'add-service-plugin':
    case 'update-service-plugin':
    case 'remove-service-plugin': return state.map(state => service(state, log));

    default: return state;
    }
};
