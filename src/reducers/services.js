import { parseService, parseRoute, parsePlugin } from '../readKongApi';

const plugins = (state, log, version) => {
  const { params: { type, endpoint: { params, body } }, content } = log;

  switch (type) {

  case 'add-route-plugin':
  case 'add-service-plugin':
    return [ ...state, parsePlugin(content, version) ];
  case 'update-route-plugin':
  case 'update-service-plugin':
    return state.map(state => {
      if (state._info.id !== content.id) {
        return state;
      }

      return parsePlugin(content, version);
    });
  case 'remove-route-plugin':
  case 'remove-service-plugin': return state.filter(plugin => plugin._info.id !== params.pluginId);
  default: return state;
  }
};

const routes = (state, log, version) => {
  const { params: { type, endpoint: { params, body } }, content } = log;

  switch (type) {

    case 'update-route-plugin':
    case 'add-route-plugin':
    case 'remove-route-plugin':
      const route = state.find((route) => route.name === params.routeName);
      return [
        ...state,
        {
          ...route,
          plugins: plugins(route.plugins, log, version)
        }
      ];
    case 'add-service-route':
      return [
        ...state.filter(route => route.name !== params.routeName),
        {...parseRoute(content), plugins: [] }
      ];
    case 'update-service-route':
      return state.map(state => {
        if (state._info.id !== content.id) {
          return state;
        }
        return { ...parseRoute(content), plugins: state.plugins };
      });
    case 'remove-service-route':
      return state.filter(route => route.name !== params.routeName );
    default:
      return state;
  }
};

const service = (state, log, version) => {
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
      routes: routes(state.routes, log, version)
    };

  case 'add-service-plugin':
  case 'update-service-plugin':
  case 'remove-service-plugin':
    if (state._info.id !== params.serviceId) {
      return state;
    }

    return {
      ...state,
      plugins: plugins(state.plugins, log, version)
    };

  default: return state;
  }
};

export default (state = [], log, version) => {
  if (log.type !== 'response') {
    return state;
  }

  const { params: { type, endpoint: { params } }, content } = log;

  switch (type) {
  case 'create-service': return [...state, service(undefined, log, version)];
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
  case 'remove-service-plugin': return state.map(state => service(state, log, version));

  default: return state;
  }
};
