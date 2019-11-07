import cloneDeep from "lodash.clonedeep";
import { testAdminApi, tearDown } from "./util";
import execute from "../src/core";

const baseConfig = {
    services: [
        {
            name: "example",
            attributes: {
                url: "http://example.com"
            },
            routes: [
                {
                    name: "foo",
                    attributes: {
                        paths: ["/foo", "/bar"],
                        regex_priority: 3
                    }
                }
            ]
        }
    ]
};

// Assumes there's only one route configured
async function getRoute() {
    return (await testAdminApi.fetchRoutes())[0];
}

beforeEach(tearDown);

it("throws an error if the route doesn't have a name", async () => {
    const config = cloneDeep(baseConfig);
    delete config.services[0].routes[0].name;
    await expect(execute(config, testAdminApi)).rejects.toThrow(
        /^Route name is required/
    );
});


it('creates, updates, and removes a route', async () => {
    await execute(baseConfig, testAdminApi);
    expect(await getRoute()).toMatchObject({
        name: "foo",
        paths: expect.arrayContaining(["/foo", "/bar"]),
        regex_priority: 3
    });

    const config = cloneDeep(baseConfig);
    const route = config.services[0].routes[0];
    route.attributes.paths = ["/bar", "/baz"];
    await execute(config, testAdminApi);
    expect(await getRoute()).toMatchObject({
        name: "foo",
        paths: expect.arrayContaining(["/bar", "/baz"]),
        regex_priority: 3
    });

    route.ensure = "removed";
    await execute(config, testAdminApi);
    expect(await testAdminApi.fetchRoutes()).toEqual([]);
});

it('adds, updates, and removes a route plugin', async () => {
    const pluginConfig = cloneDeep(baseConfig);
    const route = pluginConfig.services[0].routes[0];

    route.plugins = [
        { name: "key-auth" },
        { name: "rate-limiting", attributes: { config: { second: 1 } } }
    ];
    await execute(pluginConfig, testAdminApi);
    let plugins = await testAdminApi.fetchRoutePlugins("foo");
    expect(plugins).toHaveLength(2);
    expect(plugins).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ name: "key-auth" }),
            expect.objectContaining({
                name: "rate-limiting",
                config: expect.objectContaining({ second: 1 })
            })
        ])
    );

    // Update rate-limiting plugin config
    route.plugins[1].attributes.config.second = 2;
    // Remove key-auth plugin
    route.plugins[0].ensure = "removed";

    await execute(pluginConfig, testAdminApi);
    plugins = await testAdminApi.fetchRoutePlugins("foo");
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
        name: "rate-limiting",
        config: { second: 2 }
    });
});
