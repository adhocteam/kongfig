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
                    attributes: {
                        name: "foo",
                        paths: ["/foo", "/bar"],
                        regex_priority: 3
                    }
                }
            ]
        }
    ]
};

// Return config with route name moved from attribute to top level of route
// Only handles a single service with a single route
function topLevelRouteName(config) {
    const newConfig = cloneDeep(config);
    newConfig.services[0].routes[0].name =
        newConfig.services[0].routes[0].attributes.name;
    delete newConfig.services[0].routes[0].attributes.name;
    return newConfig;
}

// Assumes there's only one route configured
async function getRoute() {
    return (await testAdminApi.fetchRoutes())[0];
}

beforeEach(tearDown);

it("throws an error if the route doesn't have a name", async () => {
    const config = cloneDeep(baseConfig);
    delete config.services[0].routes[0].attributes.name;
    await expect(execute(config, testAdminApi)).rejects.toThrow(
        /^Route name is required/
    );
});

// Run all tests with both route name locations
[
    [baseConfig, "with route name in attributes"],
    [topLevelRouteName(baseConfig), "with top level route name"]
].forEach(async ([config, testSuffix]) => {
    it(`creates and updates a new route ${testSuffix}`, async () => {
        await execute(config, testAdminApi);
        expect(await getRoute()).toMatchObject({
            name: "foo",
            paths: expect.arrayContaining(["/foo", "/bar"]),
            regex_priority: 3
        });

        const updatedConfig = cloneDeep(config);
        updatedConfig.services[0].routes[0].attributes.paths = ["/bar", "/baz"];
        await execute(updatedConfig, testAdminApi);
        expect(await getRoute()).toMatchObject({
            name: "foo",
            paths: expect.arrayContaining(["/bar", "/baz"]),
            regex_priority: 3
        });
    });
});
