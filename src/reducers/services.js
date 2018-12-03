import { parseService, parseRoute, parsePlugin, parseConsumer, parseAcl, parseGlobalPlugin } from '../readKongApi';

const plugins = (state, log) => {
  const { params: { type, endpoint: { params, body } }, content } = log;

  switch (type) {

  case 'add-route-plugin':
  case 'add-service-plugin': return [ ...state, parsePlugin(content) ];
  case 'update-route-plugin':
  case 'update-service-plugin': return state.map(state => {
    if (state._info.id !== content.id) {
      return state;
    }

    return parsePlugin(content);
  });
  case 'remove-route-plugin':
  case 'remove-service-plugin': return state.filter(plugin => plugin._info.id !== params.pluginId);
  default: return state;
  }
};

const routes = (state, log) => {
  const { params: { type, endpoint: { params, body } }, content } = log;

  switch (type) {

  case 'update-route-plugin':
  case 'add-route-plugin':
  case 'remove-route-plugin':
    const route = state.find((route) => route.id === params.routeId);
    console.log(route. log);
    return [
      ...state,
      {
        ...route,
        plugins: plugins(route.plugins, log)
      }
    ];
  case 'add-service-route':
    const { name, ...rest } = parseRoute(content);
    return [
      ...state.filter(route => route.name !== params.routeName),
      {name: params.routeName, ...rest, plugins: [] }
    ];
  case 'update-service-route': return state.map(state => {
    if (state._info.id !== content.id) {
      return state;
    }

    let { name, ...rest } = parseRoute(content);
    return { name: params.routeName, ...rest, plugins: state.plugins };
  });
  case 'remove-service-route': return state.filter(route => route.id !== params.routeId );
  default: return state;
  }
};

const service = (state, log) => {
  const { params: { type, endpoint: { params, body } }, content } = log;

  switch (type) {
  case 'create-service': return {
    ...parseService(content),
    plugins: [],
    routes: []
  };
  case 'update-service':
    if (state._info.id !== content.id) {
      return state;
    }

    return {
      ...state,
      ...parseService(content)
    };

  case 'add-service-route':
  case 'update-service-route':
  case 'update-route-plugin':
  case 'add-route-plugin':
  case 'remove-route-plugin':
  case 'remove-service-route':
    if (state._info.id !== params.serviceId) {
      return state;
    }

    return {
      ...state,
      routes: routes(state.routes, log)
    };

  case 'add-service-plugin':
  case 'update-service-plugin':
  case 'remove-service-plugin':
    if (state._info.id !== params.serviceId) {
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

  case 'update-route-plugin':
  case 'add-route-plugin':
  case 'remove-route-plugin':
  case 'update-service':
  case 'add-service-route':
  case 'update-service-route':
  case 'remove-service-route':
  case 'add-service-plugin':
  case 'update-service-plugin':
  case 'remove-service-plugin': return state.map(state => service(state, log));

  default: return state;
  }
};
