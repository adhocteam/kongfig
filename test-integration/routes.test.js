import { testAdminApi, tearDown } from "./util";
import execute from "../src/core";

const routeId = "c5b6914d-2bfd-4bb5-8f45-2e94cf9ff8b5";
const path = "/foo";
const endpoint = {
    name: "route",
    params: { routeName: 'foo' }
};

async function requestRoute(params) {
    const response = await testAdminApi.requestEndpoint(endpoint, params);
    return await response.json();
}

beforeEach(async () => {
    await tearDown();
    const response = await testAdminApi.requestEndpoint(
        {
            name: "services"
        },
        {
            method: "POST",
            body: {
                name: "example",
                url: "http://example.com"
            }
        }
    );
    const serviceId = (await response.json()).id;
    await testAdminApi.requestEndpoint(endpoint, {
        method: "PUT",
        body: {
            paths: [path],
            service: {
                id: serviceId
            }
        }
    });
});

it("should update a route name when it's a top level property", async () => {
    const config = {
        services: [
            {
                name: "example",
                attributes: {
                    url: "http://example.com"
                },
                routes: [
                    {
                        name: "foo",
                        id: routeId,
                        attributes: {
                            paths: ['/bar']
                        }
                    }
                ]
            }
        ]
    };
    await execute(config, testAdminApi);
    const route = await requestRoute({ method: "GET" });
    expect(route).toHaveProperty("name", "foo");
    expect(route).toHaveProperty("paths", ['/bar'])
});

it("should update a route name when it's an attribute", async () => {
    const config = {
        services: [
            {
                name: "example",
                attributes: {
                    url: "http://example.com"
                },
                routes: [
                    {
                        id: routeId,
                        attributes: {
                            name: "foo",
                            paths: ['/bar']
                        }
                    }
                ]
            }
        ]
    };
    await execute(config, testAdminApi);
    const route = await requestRoute({ method: "GET" });
    expect(route).toHaveProperty("name", "foo");
    expect(route).toHaveProperty("paths", ['/bar'])
});
