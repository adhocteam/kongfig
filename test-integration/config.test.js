import execute from '../src/core';
import { testAdminApi, exportToYaml, logger, getLog, getLocalState, tearDown, ignoreKeys } from './util';
import readKongApi from '../src/readKongApi';
import { configLoader } from '../src/configLoader';
import fs from 'fs';
import path from 'path';

beforeEach(tearDown);
jest.setTimeout(10000);

const ignoreConfigOrder = state => ({
    ...state,
    apis: state.apis.sort((a, b) => a.name > b.name ? 1 : -1),
    consumers: state.consumers.sort((a, b) => a.username > b.username ? 1 : -1),
    plugins: state.plugins.sort((a, b) => a.attributes.config.minute - b.attributes.config.minute),
    upstreams: state.upstreams.map(upstream => ({
        ...upstream,
        targets: upstream.targets.sort((a, b) => a.target > b.target ? 1 : -1),
    })),
    services: state.services.sort((a, b) => a.name > b.name ? 1 : -1),
});

fs.readdirSync(path.resolve(__dirname, './config')).forEach(filename => {
    it(`should apply ${filename}`, async () => {
        const configPath = path.resolve(__dirname, './config', filename);
        const config = configLoader(configPath);

        await execute(config, testAdminApi, logger);
        await execute(config, testAdminApi, logger); // all the actions should be no-op
        const kongState = ignoreConfigOrder(await readKongApi(testAdminApi));

        expect(getLog()).toMatchSnapshot();
        expect(exportToYaml(ignoreKeys(kongState))).toMatchSnapshot();
        expect(ignoreConfigOrder(getLocalState())).toEqual(kongState);
    });
});
