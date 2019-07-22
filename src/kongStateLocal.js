import reducer from './reducers';

export const logReducer = (state = {}, log) => {
    if (log.type !== 'response' && log.type !== 'kong-info') {
        return state;
    }

    return reducer(state, log);
};
