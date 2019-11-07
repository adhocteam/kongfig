import execute from '../src/core';
import { testAdminApi, exportToYaml, logger, getLog, getLocalState, tearDown, ignoreKeys } from './util';
import readKongApi from '../src/readKongApi';
import { configLoader } from '../src/configLoader';
import fs from 'fs';
import path from 'path';
import 'core-js/features/object/from-entries';

beforeEach(tearDown);
jest.setTimeout(10000);

// This depends on ES2015's guarantee that object properties are stored
// and returned in the order they were created. This isn't guaranteed in
// older versions of the spec, but the node.js implementation has always
// worked that way.
const sortObjectProperties = obj => {
    return Object.fromEntries(Object.entries(obj)
        .sort(([k1, v1], [k2, v2]) => {
            k1 > k2 ? 1 : -1;
        })
    );
}

const ignoreConfigOrder = state => ({
    ...state,
    consumers: state.consumers.sort((a, b) => a.username > b.username ? 1 : -1),
    plugins: state.plugins
        .sort((a, b) => a.attributes.config.minute - b.attributes.config.minute)
        .map(plugin => ({
            ...plugin,
            attributes: sortObjectProperties(plugin.attributes),
        })),
    upstreams: state.upstreams.map(upstream => ({
        ...upstream,
        targets: upstream.targets.sort((a, b) => a.target > b.target ? 1 : -1),
    })),
    services: state.services.sort((a, b) => a.name > b.name ? 1 : -1),
});

// In Kong <1.0, routes don't have names. As a workaround, when we
// parse the route payload from kong, we set the name property to
// the route's id (see the parseRoute function at src/readAdminApi.js:163).
// This function sets route.name to route.id in our local state.
const fixRouteNames = state => ({
    ...state,
    services: state.services.map(service => ({
        ...service,
        routes: service.routes.map(route => ({
            ...route,
            name: route.id,
        })),
    }))
});

// It appears that kong returns the semi-optional paths, methods,
// and hosts keys in some HTTP responses, but not in others.
// This function adds those null keys for testing purposes.
const addRouteNullKeys = state => { debugger; return ({
    ...state,
    services: state.services.map(service => ({
        ...service,
        routes: service.routes.map(route => ({
            ...route,
            attributes: {
                ...route.attributes,
                hosts: route.attributes.hosts || null,
                paths: route.attributes.paths || null,
                methods: route.attributes.methods || null,
            },
        })),
    })),
})};

fs.readdirSync(path.resolve(__dirname, './config')).forEach(filename => {
    it(`should apply ${filename}`, async () => {
        const configPath = path.resolve(__dirname, './config', filename);
        const [config, _] = configLoader(configPath);

        await execute(config, testAdminApi, logger);
        await execute(config, testAdminApi, logger); // all the actions should be no-op
        const kongState = ignoreConfigOrder(await readKongApi(testAdminApi));

        expect(getLog()).toMatchSnapshot();
        expect(exportToYaml(ignoreKeys(kongState))).toMatchSnapshot();
        expect(ignoreConfigOrder(fixRouteNames(getLocalState()))).toEqual(addRouteNullKeys(kongState));
    });
});
