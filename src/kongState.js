import semVer from 'semver';
import {getSupportedCredentials} from './consumerCredentials';
import { getForeignEntityID } from './utils';

const fetchUpstreamsWithTargets = async ({ version, fetchUpstreams, fetchTargets }) => {
    if (semVer.lte(version, '0.10.0')) {
        return Promise.resolve([]);
    }

    const upstreams = await fetchUpstreams();

    return await Promise.all(
        upstreams.map(async item => {
            const targets = await fetchTargets(item.id);

            return { ...item, targets };
        })
    );
};

const fetchCertificatesForVersion = async ({ version, fetchCertificates }) => {
    if (semVer.lte(version, '0.10.0')) {
        return Promise.resolve([]);
    }

    return await fetchCertificates();
};

export default async (adminApi) => {
    const version = await adminApi.fetchKongVersion();
    let servicesWithPluginsAndRoutes = [];

    if (semVer.gte(version, '0.13.0')) {
        const services = await adminApi.fetchServices();
        servicesWithPluginsAndRoutes = await Promise.all(services.map(async item => {
            const plugins = await adminApi.fetchServicePlugins(item.id);
            const routes = await adminApi.fetchServiceRoutes(item.name);
            const routesWithPlugins = await Promise.all(routes.map(async route => {
                const routePlugins = await adminApi.fetchRoutePlugins(route.id);

                return {...route, plugins: routePlugins};
            }));

            return {...item, plugins, routes: routesWithPlugins};
        }));

    }

    const consumers = await adminApi.fetchConsumers();
    const consumersWithCredentialsAndAcls = await Promise.all(consumers.map(async consumer => {
        if (consumer.custom_id && !consumer.username) {
            console.log(`Consumers with only custom_id not supported: ${consumer.custom_id}`);

            return consumer;
        }

        const allCredentials = Promise.all(getSupportedCredentials().map(name => {
            return adminApi.fetchConsumerCredentials(consumer.id, name)
                .then(credentials => [name, credentials]);
        }));

        var aclsFetched = await adminApi.fetchConsumerAcls(consumer.id);

        var consumerWithCredentials = allCredentials
            .then(result => {
                return {
                    ...consumer,
                    credentials: result.reduce((acc, [name, credentials]) => {
                        return {...acc, [name]: credentials};
                    }, {}),
                    acls: aclsFetched

                };
            });

        return consumerWithCredentials;

    }));

    const allPlugins = await adminApi.fetchAllPlugins();
    const globalPlugins = allPlugins.filter(plugin => {
        return !getForeignEntityID(plugin, 'service') && !getForeignEntityID(plugin, 'route');
    });

    const upstreamsWithTargets = await fetchUpstreamsWithTargets({
        version,
        fetchUpstreams: adminApi.fetchUpstreams,
        fetchTargets: semVer.gte(version, '0.12.0') ? adminApi.fetchTargets : adminApi.fetchTargetsV11Active
    });
    const certificates = await fetchCertificatesForVersion({ version, fetchCertificates: adminApi.fetchCertificates });

    return {
        services: servicesWithPluginsAndRoutes,
        consumers: consumersWithCredentialsAndAcls,
        plugins: globalPlugins,
        upstreams: upstreamsWithTargets,
        certificates,
        version,
    };
};
