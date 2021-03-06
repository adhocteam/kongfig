'use strict';

import colors from 'colors';
import assign from 'object-assign';
import invariant from 'invariant';
import semVer from 'semver';
import readKongApi from './readKongApi';
import {getSchema as getConsumerCredentialSchema} from './consumerCredentials';
import {normalize as normalizeAttributes, getAssociatedEntityID, shouldBeRemoved} from './utils';
import { logReducer } from './kongStateLocal';
import getCurrentStateSelector from './stateSelector';
import diff from './diff';
import uuidv4 from 'uuid/v4';
import {
  noop,
  createService,
  updateService,
  removeService,
  addRoutePlugin,
  removeRoutePlugin,
  updateRoutePlugin,
  addServicePlugin,
  removeServicePlugin,
  updateServicePlugin,
  addServiceRoute,
  removeServiceRoute,
  updateServiceRoute,
  addGlobalPlugin,
  removeGlobalPlugin,
  updateGlobalPlugin,
  createConsumer,
  updateConsumer,
  removeConsumer,
  addConsumerCredentials,
  updateConsumerCredentials,
  removeConsumerCredentials,
  addConsumerAcls,
  removeConsumerAcls
} from './actions';

import {
  createUpstream,
  removeUpstream,
  updateUpstream,
  addUpstreamTarget,
  removeUpstreamTarget,
  updateUpstreamTarget
} from './actions/upstreams';

import {
  addCertificate,
  removeCertificate,
  addCertificateSNI,
  removeCertificateSNI,
} from './actions/certificates';

export const consumerAclSchema = {
  id: 'group'
};


export function getAclSchema() {
  return consumerAclSchema;
}

const logFanout = () => {
  const listeners = [];

  return {
    logger: log => listeners.forEach(f => f(log)),
    subscribe: f => listeners.push(f),
  };
};

const selectWorldStateBind = async (adminApi, internalLogger, config = {}, localState = true) => {
  if (localState) {
    internalLogger.logger({ type: 'experimental-features', message: `Using experimental feature: local state`.blue.bold});
    let state = await readKongApi(adminApi, config);

    internalLogger.subscribe(log => {
      state = logReducer(state, log);
    });

    return f => async () => [f(_createWorld(getCurrentStateSelector(state))), getCurrentStateSelector(state)];
  }

  return _bindWorldState(adminApi);
};

// there is an issue with dependency by other definitions to consumers
// so they need to be added first and removed last
const splitConsumersByRemoved = consumers => (consumers || []).reduce((results, consumer) => {
  if (consumer.ensure === 'removed') {
    return { ...results, removed: [...results.removed, consumer] };
  }

  return { ...results, added: [...results.added, consumer] };
}, { removed: [], added: [] });

export default async function execute(config, adminApi, logger = () => {}, removeRoutes = true, dryRun = false, localState = true) {
  const internalLogger = logFanout();
  const splitConsumersConfig = splitConsumersByRemoved(config.consumers);

  const actions = [
    ...consumers(splitConsumersConfig.added),
    ...upstreams(config.upstreams),
    ...services(config.services, removeRoutes),
    ...globalPlugins(config.plugins),
    ...certificates(config.certificates),
    ...consumers(splitConsumersConfig.removed),
  ];

  internalLogger.subscribe(logger);

  internalLogger.logger({
    type: 'kong-info',
    version: await adminApi.fetchKongVersion(),
  });

  return actions
    .map(await selectWorldStateBind(adminApi, internalLogger, config, localState))
    .reduce((promise, action) => promise.then(_executeActionOnApi(action, adminApi, internalLogger.logger, dryRun)), Promise.resolve(''));
}

export function services(services = [], removeRoutes) {
  return services.reduce((actions, service) => {
    // The _service function compares your service config with the current kong
    // state, and determines what changes need to be made. It will add a remove-service
    // action if the service has `ensure: removed`. If that happens before the routes
    // are removed, kong will fail to remove the service, due to a foreign key constraint
    // (the routes still reference the service).
    if (shouldBeRemoved(service)) {
        return [...actions, removeOldRoutes(service, removeRoutes), ..._serviceRoutes(service), ..._servicePlugins(service), _service(service)]
    }
    // In the other case, where _service returns a create-service action, we need
    // to create the service before adding any other entities that reference the
    // service, or those actions will fail because they attempt to reference a
    // nonexistent service.
    else {
      return [...actions, _service(service), removeOldRoutes(service, removeRoutes), ..._serviceRoutes(service), ..._servicePlugins(service)]
    }
  }, []);
}

export function routes(serviceName, routes = []) {
  return routes.reduce((actions, route) => [...actions, _route(serviceName, route), ..._routePlugins(serviceName, route)], []);
}

export function globalPlugins(globalPlugins = []) {
  return globalPlugins.reduce((actions, plugin) => [...actions, _globalPlugin(plugin)], []);
}

export function routePlugins(serviceName, routeName, plugins) {
  return plugins.reduce((actions, plugin) => [...actions, _routePlugin(serviceName, routeName, plugin)], []);
}

export function servicePlugins(serviceName, plugins) {
  return plugins.reduce((actions, plugin) => [...actions, _servicePlugin(serviceName, plugin)], []);
}

export function consumers(consumers = []) {
  return consumers.reduce((calls, consumer) => [...calls, _consumer(consumer), ..._consumerCredentials(consumer), ..._consumerAcls(consumer)], []);
}

export function credentials(username, credentials) {
  return credentials.reduce((actions, credential) => [...actions, _consumerCredential(username, credential)], []);
}

export function acls(username, acls) {
  return acls.reduce((actions, acl) => [...actions, _consumerAcl(username, acl)], []);
}

export function upstreams(upstreams = []) {
  return upstreams.reduce((actions, upstream) => [...actions, _upstream(upstream), ..._upstreamTargets(upstream)], []);
}

export function targets(upstreamName, targets) {
  return targets.reduce((actions, target) => [...actions, _target(upstreamName, target)], []);
}

export function certificates(certificates = []) {
  return certificates.reduce((actions, cert) => [...actions, _certificate(cert), ...certificatesSNIs(cert, cert.snis)], []);
}

export function certificatesSNIs(certificate, snis) {
  if (certificate.ensure === 'removed') {
    return [];
  }

  return snis.reduce((actions, sni) => [...actions, _sni(certificate, sni)], []);
}

function parseResponseContent(content) {
  try {
    return JSON.parse(content);
  } catch (e) {}

  return content;
}

function _executeActionOnApi(action, adminApi, logger, dry = false) {
  return async () => {
    const [_ps, state] = await action();

    const ps = (Array.isArray(_ps)) ? _ps : [_ps];

    return ps.reduce((promise, params) => {

      if (params.noop) {
        logger({ type: 'noop', params });

        return Promise.resolve(state);
      }

      logger({ type: 'request', params, uri: adminApi.router(params.endpoint) });

      return promise.then(() => {
        let p;
        if (dry) {
          p = Promise.resolve('')
            .then(response => Promise.all([
              {
                type: 'response',
                ok: true,
                uri: adminApi.router(params.endpoint),
                status: (params.method === 'POST') ? 201 : (params.method === 'DELETE') ? 204 : 200,
                statusText: 'DRY RUN',
                params,
              },
              JSON.stringify({ id: uuidv4(), ...params.body })
            ]));
        } else {
          p = adminApi
            .requestEndpoint(params.endpoint, params)
            .then(response => Promise.all([
              {
                type: 'response',
                ok: response.ok,
                uri: adminApi.router(params.endpoint),
                status: response.status,
                statusText: response.statusText,
                params,
              },
              response.text()
            ]));
        }
        return p.then(([response, content]) => {
          logger({ ...response, content: parseResponseContent(content) });

          if (!response.ok) {
            const error = new Error(`${response.statusText}\n${content}`);
            error.response = response;

            throw error;
          }
          return state;
        });
      });
    }, Promise.resolve(state));
  };
}

function _bindWorldState(adminApi) {
  return f => async () => {
    const state = await readKongApi(adminApi);

    return f(_createWorld(state));
  };
}

function _createWorld({consumers, plugins, upstreams, services, certificates, _info: { version }}) {
  const world = {
    getVersion: () => version,

    hasService: serviceName => Array.isArray(services) && services.some(service => service.name === serviceName),
    getService: serviceName => {
      const service = services.find(service => service.name === serviceName);

      invariant(service, `Unable to find service ${serviceName}`);

      return service;
    },
    getServiceId: serviceName => {
      const id = world.getService(serviceName)._info.id;

      invariant(id, `Service ${serviceName} doesn't have an Id`);

      return id;
    },
    getGlobalPlugin: (pluginName, pluginConsumerID) => {
      const plugin = plugins.find(plugin => plugin.name === pluginName && pluginTargetsConsumer(plugin, pluginConsumerID));

      invariant(plugin, `Unable to find global plugin ${pluginName} for consumer ${pluginConsumerID}`);

      return plugin;
    },
    getServicePlugin: (serviceName, pluginName, pluginConsumerID) => {
      const plugin = world.getService(serviceName).plugins.find(plugin => plugin.name == pluginName && pluginTargetsConsumer(plugin, pluginConsumerID));

      invariant(plugin, `Unable to find plugin ${pluginName}`);

      return plugin;
    },
    getRoutePluginId: (serviceName, routeName, pluginName, pluginConsumerID) => {
      const pluginId = world.getServiceRoute(serviceName, routeName).plugins.find(plugin => plugin.name == pluginName && pluginTargetsConsumer(plugin, pluginConsumerID))._info.id;

      invariant(pluginId, `Route plugin ${pluginName} doesn't have an id`);

      return pluginId;
    },
    getRoutePlugin: (serviceName, routeName, pluginName, pluginConsumerID) => {
      const plugin = world.getServiceRoute(serviceName, routeName).plugins.find(plugin => plugin.name == pluginName && pluginTargetsConsumer(plugin, pluginConsumerID));

      invariant(plugin, `Unable to find plugin ${pluginName}`);

      return plugin;
    },
    getServicePluginId: (serviceName, pluginName, pluginConsumerID) => {
      const pluginId = world.getServicePlugin(serviceName, pluginName, pluginConsumerID)._info.id;

      invariant(pluginId, `Unable to find plugin id for ${serviceName} and ${pluginName}`);

      return pluginId;
    },
    getGlobalPluginId: (pluginName, pluginConsumerID) => {
      const globalPluginId = world.getGlobalPlugin(pluginName, pluginConsumerID)._info.id;

      invariant(globalPluginId, `Unable to find global plugin id ${pluginName}`);

      return globalPluginId;
    },
    hasRoute: (serviceName, { name }) => {
      return Array.isArray(services) && services.some(service => service.name === serviceName && Array.isArray(service.routes) && service.routes.some(route => route.name === name ));
    },
    hasRoutePlugin: (serviceName, routeName, pluginName, pluginConsumerID) => {
      const route = world.getServiceRoute(serviceName, routeName);
      return Array.isArray(route.plugins) && route.plugins.some(plugin => plugin.name == pluginName && pluginTargetsConsumer(plugin, pluginConsumerID));
    },
    hasServicePlugin: (serviceName, pluginName, pluginConsumerID) => {
      return Array.isArray(services) && services.some(service => service.name === serviceName && Array.isArray(service.plugins) && service.plugins.some(plugin => plugin.name == pluginName && pluginTargetsConsumer(plugin, pluginConsumerID)));
    },
    hasGlobalPlugin: (pluginName, pluginConsumerID) => {
      return Array.isArray(plugins) && plugins.some(plugin => plugin.name === pluginName && pluginTargetsConsumer(plugin, pluginConsumerID));
    },
    hasConsumer: (username) => {
      return Array.isArray(consumers) && consumers.some(consumer => consumer.username === username);
    },
    hasConsumerCredential: (username, name, attributes) => {
      const consumer = world.getConsumer(username);

      return !!extractCredential(consumer.credentials, name, attributes);
    },
    hasConsumerAcl: (username, groupName) => {
      const schema = getAclSchema();

      return Array.isArray(consumers) && consumers.some(function (consumer) {
        return Array.isArray(consumer.acls) && consumer.acls.some(function (acl) {
          return consumer.username === username && acl[schema.id] == groupName;
        });
      });
    },

    getConsumer: username => {
      invariant(username, `Username is required`);

      const consumer = consumers.find(c => c.username === username);

      invariant(consumer, `Unable to find consumer ${username}`);

      return consumer;
    },

    getConsumerId: username => {
      invariant(username, `Username is required`);

      const consumerId = world.getConsumer(username)._info.id;

      invariant(consumerId, `Unable to find consumer id ${username} ${consumerId}`);

      return consumerId;
    },

    getConsumerCredential: (username, name, attributes) => {
      const consumer = world.getConsumer(username);

      const credential = extractCredential(consumer.credentials, name, attributes);

      invariant(credential, `Unable to find consumer credential ${username} ${name}`);

      return credential;
    },

    getConsumerAcl: (username, groupName) => {
      const consumer = world.getConsumer(username);

      const acl = extractAclId(consumer.acls, groupName);

      invariant(acl, `Unable to find consumer acl ${username} ${groupName}`);

      return acl;
    },

    getConsumerCredentialId: (username, name, attributes) => {
      const credentialId = world.getConsumerCredential(username, name, attributes)._info.id;

      invariant(credentialId, `Unable to find consumer credential id ${username} ${name}`);

      return credentialId;
    },

    getConsumerAclId: (username, groupName) => {
      const aclId = world.getConsumerAcl(username, groupName)._info.id;

      invariant(aclId, `Unable to find consumer acl id ${username} ${groupName}`);

      return aclId;
    },

    getServiceRoute: (serviceName, routeName) => {
      const route = world.getService(serviceName).routes.find(route => route.name === routeName);

      invariant(route, `Unable to find route ${routeName}`);

      return route;
    },

    isConsumerUpToDate: (username, custom_id) => {
      const consumer = world.getConsumer(username);

      return consumer.custom_id == custom_id;
    },

    isServiceUpToDate: (service) => {
      return diff(service.attributes, world.getService(service.name).attributes).length == 0;
    },

    isRoutePluginUpToDate: (serviceName, routeName, plugin, consumerID) => {
      if (false == plugin.hasOwnProperty('attributes')) {
        // of a plugin has no attributes, and its been added then it is up to date
        return true;
      }

      let current = world.getRoutePlugin(serviceName, routeName, plugin.name, consumerID);
      let attributes = normalizeAttributes(plugin.attributes);

      return isAttributesWithConfigUpToDate(attributes, current.attributes);
    },

    isServicePluginUpToDate: (serviceName, plugin, consumerID) => {
      if (false == plugin.hasOwnProperty('attributes')) {
        // of a plugin has no attributes, and its been added then it is up to date
        return true;
      }

      let current = world.getServicePlugin(serviceName, plugin.name, consumerID);
      let attributes = normalizeAttributes(plugin.attributes);

      return isAttributesWithConfigUpToDate(attributes, current.attributes);
    },

    isRouteUpToDate: (serviceName, route) => {
      return diff(route.attributes, world.getServiceRoute(serviceName, route.name).attributes).length == 0;
    },

    isGlobalPluginUpToDate: (plugin, consumerID) => {
      if (false == plugin.hasOwnProperty('attributes')) {
        // of a plugin has no attributes, and its been added then it is up to date
        return true;
      }

      let current = world.getGlobalPlugin(plugin.name, consumerID);
      let attributes = normalizeAttributes(plugin.attributes);

      return isAttributesWithConfigUpToDate(attributes, current.attributes);
    },

    isConsumerCredentialUpToDate: (username, credential) => {
      const current = world.getConsumerCredential(username, credential.name, credential.attributes);

      return isAttributesWithConfigUpToDate(credential.attributes, current.attributes);
    },

    hasUpstream: upstreamName => Array.isArray(upstreams) && upstreams.some(upstream => upstream.name === upstreamName),
    getUpstream: upstreamName => {
      const upstream = upstreams.find(upstream => upstream.name === upstreamName);

      invariant(upstream, `Unable to find upstream ${upstreamName}`);

      return upstream;
    },
    getUpstreamId: upstreamName => {
      const id = world.getUpstream(upstreamName)._info.id;

      invariant(id, `Upstream ${upstreamName} doesn't have an Id`);

      return id;
    },
    isUpstreamUpToDate: (upstream) => {
      return diff(upstream.attributes, world.getUpstream(upstream.name).attributes).length === 0;
    },
    hasUpstreamTarget: (upstreamName, targetName) => {
      return !!world.getActiveUpstreamTarget(upstreamName, targetName);
    },
    getUpstreamTarget: (upstreamName, targetName) => {
      const target = world.getActiveUpstreamTarget(upstreamName, targetName);

      invariant(target, `Unable to find target ${targetName}`);

      return target;
    },
    isUpstreamTargetUpToDate: (upstreamName, target) => {
      if (!target.attributes) {
        return true;
      }

      const existing = upstreams.find(upstream => upstream.name === upstreamName)
            .targets.find(t => {
              return t.target === target.target;
            });

      return !!existing && diff(target.attributes, existing.attributes).length === 0;
    },
    getActiveUpstreamTarget: (upstreamName, targetName) => {
      const upstream = upstreams.find(upstream => upstream.name === upstreamName && Array.isArray(upstream.targets) && upstream.targets.some(target => (target.target === targetName)));

      if (upstream) {
        const targets = upstream.targets.filter(target => target.target === targetName);

        // sort descending - newest to oldest
        targets.sort((a, b) => a.created_at < b.created_at);

        return targets[0];
      }
    },
    getCertificate: ({ key }) => {
      const certificate = certificates.find(x => x.key === key);

      invariant(certificate, `Unable to find certificate for ${key.substr(1, 50)}`);

      return certificate;
    },

    getCertificateId: certificate => {
      return world.getCertificate(certificate)._info.id;
    },

    hasCertificate: ({ key }) => {
      return certificates.some(x => x.key === key);
    },

    isCertificateUpToDate: certificate => {
      const { key, cert } = world.getCertificate(certificate);

      return certificate.key == key && certificate.cert == cert;
    },

    getCertificateSNIs: certificate => {
      const { snis } = world.getCertificate(certificate);

      return snis;
    },
  };

  return world;
}

function pluginTargetsConsumer(plugin, consumerID) {
  return getAssociatedEntityID(plugin._info, 'consumer') == consumerID;
}

function isAttributesWithConfigUpToDate(defined, current) {
  const excludingConfig = ({ config, ...rest }) => rest;

  return diff(defined.config, current.config).length === 0
    && diff(excludingConfig(defined), excludingConfig(current)).length === 0;
}

function extractCredential(credentials, name, attributes) {
  const idName = getConsumerCredentialSchema(name).id;

  const credential = credentials
        .filter(c => c.name === name)
        .filter(c => c.attributes[idName] === attributes[idName]);

  invariant(credential.length <= 1, `consumer shouldn't have multiple ${name} credentials with ${idName} = ${attributes[idName]}`);

  return credential.length ? credential[0] : undefined;
}

function extractAclId(acls, groupName) {
  const idName = getAclSchema().id;
  return acls.find(x => x[idName] == groupName);
}

function removeOldRoutes(service, removeRoutes) {
  return (world) => {
    if (!removeRoutes) {
      return noop({ type: 'noop-skip-remove-routes', service });
    }

    if (world.hasService(service.name)) {
      const oldService = world.getService(service.name);
      return oldService.routes
        .filter((route) => !(service.routes.find((r) => r.name === route.name)))
        .map((route) => removeServiceRoute(oldService.name, route));
    }

    return noop({ type: 'noop-clear-service-routes', service });
  };
}

function _service(service) {
  validateEnsure(service.ensure);
  validateServiceRequiredAttributes(service);

  return (world) => {
    if (shouldBeRemoved(service)) {
      return world.hasService(service.name) ? removeService(service.name) : noop({ type: 'noop-service', service });
    }

    if (world.hasService(service.name)) {
      if (world.isServiceUpToDate(service)) {
        return noop({ type: 'noop-service', service });
      }

      return updateService(service.name, service.attributes);
    }

    return createService(service.name, service.attributes);
  };
}

function _routePlugins(serviceName, route) {
  return route.plugins && !shouldBeRemoved(route) ? routePlugins(serviceName, route.name, route.plugins) : [];
}

function _serviceRoutes(service) {
  return service.routes ? routes(service.name, service.routes) : [];
}

function _servicePlugins(service) {
  return service.plugins && !shouldBeRemoved(service) ? servicePlugins(service.name, service.plugins) : [];
}

function validateEnsure(ensure) {
  if (!ensure) {
    return;
  }

  if (['removed', 'present'].indexOf(ensure) === -1) {
    throw new Error(`Invalid ensure "${ensure}"`);
  }
}

function validateServiceRequiredAttributes(service) {
  if (!service.hasOwnProperty('name')) {
    throw Error(`"Service name is required: ${JSON.stringify(service, null, '  ')}`);
  }

  if (!service.hasOwnProperty('attributes')) {
    throw Error(`"${service.name}" service has to declare "host", "protocol", and "port" attributes or "url" attribute.`);
  }

  if ((!service.attributes.hasOwnProperty('port') ||
      !service.attributes.hasOwnProperty('host') ||
      !service.attributes.hasOwnProperty('protocol')) &&
      !service.attributes.hasOwnProperty('url') ) {
    throw Error(`"${service.name}" service has to declare "host", "protocol", and "port" attributes or "url" attribute.`);
  }
}

const swapConsumerReference = (world, plugin) => {
  if (!plugin.hasOwnProperty('attributes')) {
    return plugin;
  }

  let newPluginDef = plugin;

  if (plugin.attributes.hasOwnProperty('config') && plugin.attributes.config.anonymous_username) {
    const { config: { anonymous_username, ...config }, ...attributes } = plugin.attributes;
    const anonymous = world.getConsumerId(anonymous_username);

    newPluginDef = { ...plugin, attributes: { config: { anonymous, ...config }, ...attributes } };
  }

  if (plugin.attributes.hasOwnProperty('username') && plugin.attributes.username) {
    const { username, ...attributes } = plugin.attributes; // remove username
    const consumer_id = world.getConsumerId(username);

    newPluginDef = { ...plugin, attributes: { consumer_id, ...attributes } };
  }

  if (semVer.gte(world.getVersion(), '1.0.0') && newPluginDef.attributes.consumer_id) {
    newPluginDef.attributes.consumer = { id: newPluginDef.attributes.consumer_id }
    delete newPluginDef.attributes.consumer_id
  }

  return newPluginDef;
};

function validateRoute(route) {
  if (!route.name) {
    throw new Error(`Route name is required for\n${JSON.stringify(route, null, '  ')}`);
  }
}

function _route(serviceName, route) {
  validateEnsure(route.ensure);
  validateRoute(route);

  return world => {
    if (shouldBeRemoved(route)) {
      if (world.hasRoute(serviceName, route)) {
        return removeServiceRoute(world.getServiceId(serviceName), route);
      }

      return noop({ type: 'noop-route', route });
    }

    if (world.hasRoute(serviceName, route)) {
      if (world.isRouteUpToDate(serviceName, route)) {
        return noop({ type: 'noop-route', route });
      }

      return updateServiceRoute(world.getServiceId(serviceName), route);
    }

    return addServiceRoute(world.getServiceId(serviceName), route);
  };
}

function _routePlugin(serviceName, routeName, plugin) {
  validateEnsure(plugin.ensure);

  return world => {
    const finalPlugin = swapConsumerReference(world, plugin);
    const consumerID = finalPlugin.attributes && getAssociatedEntityID(finalPlugin.attributes, 'consumer');

    if (shouldBeRemoved(finalPlugin)) {
      if (world.hasRoutePlugin(serviceName, routeName, finalPlugin.name, consumerID)) {
        return removeRoutePlugin(
          world.getServiceId(serviceName),
          world.getServiceRoute(serviceName, routeName).name,
          world.getRoutePluginId(serviceName, routeName, finalPlugin.name, consumerID)
        );
      }

      return noop({ type: 'noop-plugin', plugin: finalPlugin });
    }

    if (world.hasRoutePlugin(serviceName, routeName, finalPlugin.name, consumerID)) {
      if (world.isRoutePluginUpToDate(serviceName, routeName, finalPlugin, consumerID)) {
        return noop({ type: 'noop-plugin', plugin: finalPlugin });
      }

      return updateRoutePlugin(
        world.getServiceId(serviceName),
        world.getServiceRoute(serviceName, routeName).name,
        world.getRoutePluginId(serviceName, routeName, finalPlugin.name, consumerID),
        finalPlugin.attributes
      );
    }

    return addRoutePlugin(
      world.getServiceId(serviceName),
      world.getServiceRoute(serviceName, routeName).name,
      finalPlugin.name, finalPlugin.attributes
    );
  };
}

function _servicePlugin(serviceName, plugin) {
  validateEnsure(plugin.ensure);

  return world => {
    const finalPlugin = swapConsumerReference(world, plugin);
    const consumerID = finalPlugin.attributes && getAssociatedEntityID(finalPlugin.attributes, 'consumer');

    if (shouldBeRemoved(finalPlugin)) {
      if (world.hasServicePlugin(serviceName, finalPlugin.name, consumerID)) {
        return removeServicePlugin(world.getServiceId(serviceName), world.getServicePluginId(serviceName, finalPlugin.name, consumerID));
      }

      return noop({ type: 'noop-plugin', plugin: finalPlugin });
    }

    if (world.hasServicePlugin(serviceName, finalPlugin.name, consumerID)) {
      if (world.isServicePluginUpToDate(serviceName, finalPlugin, consumerID)) {
        return noop({ type: 'noop-plugin', plugin: finalPlugin });
      }

      return updateServicePlugin(world.getServiceId(serviceName), world.getServicePluginId(serviceName, finalPlugin.name, consumerID), finalPlugin.attributes);
    }

    return addServicePlugin(world.getServiceId(serviceName), finalPlugin.name, finalPlugin.attributes);
  };
}

function _globalPlugin(plugin) {
  validateEnsure(plugin.ensure);

  return world => {
    const finalPlugin = swapConsumerReference(world, plugin);
    const consumerID = finalPlugin.attributes && getAssociatedEntityID(finalPlugin.attributes, 'consumer');

    if (shouldBeRemoved(finalPlugin)) {
      if (world.hasGlobalPlugin(finalPlugin.name, consumerID)) {
        return removeGlobalPlugin(world.getGlobalPluginId(finalPlugin.name, consumerID));
      }

      return noop({ type: 'noop-global-plugin', plugin: finalPlugin });
    }

    if (world.hasGlobalPlugin(finalPlugin.name, consumerID)) {
      if (world.isGlobalPluginUpToDate(finalPlugin, consumerID)) {
        return noop({ type: 'noop-global-plugin', plugin: finalPlugin });
      }

      return updateGlobalPlugin(world.getGlobalPluginId(finalPlugin.name, consumerID), finalPlugin.attributes);
    }

    return addGlobalPlugin(finalPlugin.name, finalPlugin.attributes);
  }
}

function _consumer(consumer) {
  validateEnsure(consumer.ensure);
  validateConsumer(consumer);

  return world => {
    if (shouldBeRemoved(consumer)) {
      if (world.hasConsumer(consumer.username)) {
        return removeConsumer(world.getConsumerId(consumer.username));
      }

      return noop({ type: 'noop-consumer', consumer });
    }

    if (!world.hasConsumer(consumer.username)) {
      return createConsumer(consumer.username, consumer.custom_id);
    }

    if (!world.isConsumerUpToDate(consumer.username, consumer.custom_id)) {
      return updateConsumer(world.getConsumerId(consumer.username), { username: consumer.username, custom_id: consumer.custom_id });
    }

    return noop({ type: 'noop-consumer', consumer });
  }

  let _credentials = [];

  if (consumer.credentials && !shouldBeRemoved(consumer)) {
    _credentials = consumerCredentials(consumer.username, consumer.credentials);
  }

  let _acls = [];

  if (consumer.acls && !shouldBeRemoved(consumer)) {
    _acls = consumerAcls(consumer.username, consumer.acls);
  }

  return [consumerAction, ..._credentials, ..._acls];
}

function validateConsumer({username}) {
  if (!username) {
    throw new Error("Consumer username must be specified");
  }
}

function _consumerCredentials(consumer) {
  if (!consumer.credentials || shouldBeRemoved(consumer)) {
    return [];
  }

  return credentials(consumer.username, consumer.credentials);
}

function _consumerCredential(username, credential) {
  validateEnsure(credential.ensure);
  validateCredentialRequiredAttributes(credential);

  return world => {
    if (shouldBeRemoved(credential)) {
      if (world.hasConsumerCredential(username, credential.name, credential.attributes)) {
        const credentialId = world.getConsumerCredentialId(username, credential.name, credential.attributes);

        return removeConsumerCredentials(world.getConsumerId(username), credential.name, credentialId);
      }

      return noop({ type: 'noop-credential', credential, credentialIdName });
    }

    if (world.hasConsumerCredential(username, credential.name, credential.attributes)) {
      const credentialId = world.getConsumerCredentialId(username, credential.name, credential.attributes);

      if (world.isConsumerCredentialUpToDate(username, credential)) {
        const credentialIdName = getConsumerCredentialSchema(credential.name).id;

        return noop({ type: 'noop-credential', credential, credentialIdName });
      }

      return updateConsumerCredentials(world.getConsumerId(username), credential.name, credentialId, credential.attributes);
    }

    return addConsumerCredentials(world.getConsumerId(username), credential.name, credential.attributes);
  }
}

function validateCredentialRequiredAttributes(credential) {
  const credentialIdName = getConsumerCredentialSchema(credential.name).id;

  if (false == credential.hasOwnProperty('attributes')) {
    throw Error(`${credential.name} has to declare attributes.${credentialIdName}`);
  }

  if (false == credential.attributes.hasOwnProperty(credentialIdName)) {
    throw Error(`${credential.name} has to declare attributes.${credentialIdName}`);
  }
}

function validateAclRequiredAttributes(acl) {
  const aclIdName = getAclSchema().id;

  if (false == acl.hasOwnProperty(aclIdName)) {
    throw Error(`ACLs has to declare property ${aclIdName}`);
  }
}

function _consumerAcls(consumer) {
  if (!consumer.acls || shouldBeRemoved(consumer)) {
    return [];
  }

  return acls(consumer.username, consumer.acls);
}

function _consumerAcl(username, acl) {

  validateEnsure(acl.ensure);
  validateAclRequiredAttributes(acl);

  return world => {
    if (shouldBeRemoved(acl)) {
      if (world.hasConsumerAcl(username, acl.group)) {
        const aclId = world.getConsumerAclId(username, acl.group);

        return removeConsumerAcls(world.getConsumerId(username), aclId);
      }

      return noop({ type: 'noop-acl', acl });
    }

    if (world.hasConsumerAcl(username, acl.group)) {
      return noop({ type: 'noop-acl', acl });
    }

    return addConsumerAcls(world.getConsumerId(username), acl.group);
  }
}

function _upstream(upstream) {
  validateEnsure(upstream.ensure);
  validateUpstreamRequiredAttributes(upstream);

  return world => {
    if (shouldBeRemoved(upstream)) {
      if (world.hasUpstream(upstream.name)) {
        return removeUpstream(upstream.name)
      }

      return noop({ type: 'noop-upstream', upstream });
    }

    if (world.hasUpstream(upstream.name)) {
      if ( world.isUpstreamUpToDate(upstream)) {
        return noop({ type: 'noop-upstream', upstream });
      }

      return updateUpstream(upstream.name, upstream.attributes);
    }

    return createUpstream(upstream.name, upstream.attributes);
  };
}

function _target(upstreamName, target) {
  validateEnsure(target.ensure);

  return world => {
    if (shouldBeRemoved(target) || (target.attributes && target.attributes.weight === 0)) {
      if (world.hasUpstreamTarget(upstreamName, target.target)) {
        return removeUpstreamTarget(world.getUpstreamId(upstreamName), target.target);
      }

      return noop({type: 'noop-target', target});
    }

    if (world.hasUpstreamTarget(upstreamName, target.target)) {
      if (world.isUpstreamTargetUpToDate(upstreamName, target)) {
        return noop({type: 'noop-target', target});
      }

      return updateUpstreamTarget(world.getUpstreamId(upstreamName), target.target, target.attributes);
    }

    return addUpstreamTarget(world.getUpstreamId(upstreamName), target.target, target.attributes);
  };
}

function _upstreamTargets(upstream) {
  return upstream.targets && !shouldBeRemoved(upstream) ? targets(upstream.name, upstream.targets) : [];
}

function validateUpstreamRequiredAttributes(upstream) {
  if (false == upstream.hasOwnProperty('name')) {
    throw Error(`Upstream name is required: ${JSON.stringify(upstream, null, '  ')}`);
  }
}

const _certificate = certificate => {
  validateEnsure(certificate.ensure);

  return world => {
    const identityClue = certificate.key.substr(1, 50);

    if (shouldBeRemoved(certificate)) {
      if (world.hasCertificate(certificate)) {
        return removeCertificate(world.getCertificateId(certificate));
      }

      return noop({type: 'noop-certificate', identityClue});
    }

    if (world.hasCertificate(certificate)) {
      if (world.isCertificateUpToDate(certificate)) {
        return noop({type: 'noop-certificate', identityClue});
      }

      return updateCertificate(world.getCertificateId(certificate), certificate);
    }

    return addCertificate(certificate);
  };
};

const _sni = (certificate, sni) => {
  validateEnsure(sni.ensure);
  invariant(sni.name, 'sni must have a name');

  return world => {
    const currentSNIs = world.getCertificateSNIs(certificate).map(x => x.name);
    const hasSNI = currentSNIs.indexOf(sni.name) !== -1;

    if (shouldBeRemoved(sni)) {
      if (hasSNI) {
        return removeCertificateSNI(sni.name);
      }

      return noop({type: 'noop-certificate-sni-removed', sni});
    }

    if (hasSNI) {
      return noop({type: 'noop-certificate-sni', sni});
    }

    return addCertificateSNI(world.getCertificateId(certificate), sni.name);
  };
}
