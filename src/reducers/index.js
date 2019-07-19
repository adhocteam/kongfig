import plugins from './plugins';
import consumers from './consumers';
import upstreams from './upstreams';
import certificates from './certificates';
import services from './services';

const combine = reducers => (state = {}, log) => {
    return Object.keys(reducers).reduce((nextState, key) => {
        nextState[key] = reducers[key](state[key], log, state._info && state._info.version);

        return nextState;
    }, state);
};

const _info = (state = {}, log) => {
    const { type } = log;

    switch (type) {
    case 'kong-info':
        return { ...state, version: log.version };
    default: return state;
    }
}

export default combine({
    _info,
    plugins,
    consumers,
    upstreams,
    certificates,
    services
});
