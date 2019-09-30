import expect from 'expect.js';
import {globalPlugins} from '../src/core.js';
import {
    addGlobalPlugin,
    removeGlobalPlugin,
    updateGlobalPlugin
} from '../src/actions.js';
import { parsePlugin } from '../src/readKongApi.js';

// Many of these tests use a partial mock of the world object
// in src/core.js. 1.0.0 is an arbitrary but reasonable version
// string to return for our mocked world.getVersion function.
const getVersion = () => '1.0.0';

describe("plugins", () => {
    it("should add new global plugin", () => {
        var actual = globalPlugins([{
            "ensure": "present",
            "name": "cors",
            "attributes": {
                'config.foo': "bar"
            }
        }])
        .map(x => x({
            getVersion: getVersion,
            hasGlobalPlugin: () => false
        }));

        expect(actual).to.be.eql([
            addGlobalPlugin('cors', {'config.foo': "bar"})
        ]);
    });

    it("should remove a global plugin", () => {
        var actual = globalPlugins([{
            "name": "cors",
            "ensure": "removed",
            "attributes": {
                'config.foo': "bar"
            }
        }])
        .map(x => x({
                    getVersion: getVersion,
                    hasGlobalPlugin: () => true,
                    getGlobalPluginId: () => 123
                    }));

        expect(actual).to.be.eql([
            removeGlobalPlugin(123)
        ]);
    });

    it('should update a global plugin', () => {
        var actual = globalPlugins([{
            'name': 'cors',
            'attributes': {
                'config.foo': 'bar'
            }}]
        ).map(x => x({
            getVersion: getVersion,
            hasGlobalPlugin: () => true,
            getGlobalPluginId: () => 123,
            isGlobalPluginUpToDate: () => false
        }));

        expect(actual).to.be.eql([
            updateGlobalPlugin(123, {'config.foo': 'bar'})
        ]);
    });

    it("should validate ensure enum", () => {
        expect(() => globalPlugins([{
            "ensure": "not-valid",
            "name": "cors"
        }])).to.throwException(/Invalid ensure/);
    });

    it("should not remove unknown attributes", () => {
        const plugin = {
            name: 'cors',
            id: 'b58117d6-4fb4-4d44-a4a9-b753719dcbee',
            enabled: true,
            created_at: 1569855466,
            config: {
                foo: 'bar',
            },
            foo: ['bar', 'baz'],
        }
        expect(parsePlugin(plugin, '1.0.0').attributes.foo).to.be.eql(['bar', 'baz']);
    });
});
