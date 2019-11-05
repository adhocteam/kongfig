const createLogHandler = handlers => message => {
    if (handlers.hasOwnProperty(message.type)) {
        return handlers[message.type](message);
    }

    return handlers['unknown'](message);
};

const censoredKeys = ['key', 'password', 'client_secret', 'access_token', 'refresh_token', 'provision_key', 'secret', 'cert'];

const censor = (key, value) => {
    if (typeof value !== 'string') {
        return value;
    }

    return censoredKeys.indexOf(key) === -1 ? value : `*****${value.slice(-4)}`;
};
const censorLogData = data => JSON.parse(JSON.stringify(data, censor));
const upToDate = 'is up to date'.bold.green;

export const screenLogger = createLogHandler({
    noop: message => createLogHandler({
        'noop-service': ({ service: { name } }) => console.log(`service ${name.bold} ${upToDate}`),
        'noop-route': ({ route: { name }}) => console.log(`route ${name.bold} ${upToDate}`),
        'noop-plugin': ({ plugin }) => console.log(`- plugin ${plugin.name.bold} ${upToDate}`),
        'noop-global-plugin': ({ plugin }) => console.log(`global plugin ${plugin.name.bold} ${upToDate}`),
        'noop-consumer': ({ consumer }) => console.log(`consumer ${consumer.username.bold} ${upToDate}`),
        'noop-credential': ({ credential, credentialIdName }) => console.log(`- credential ${credential.name.bold} with ${credentialIdName.bold}: ${censor('key', credential.attributes[credentialIdName]).bold} ${upToDate}`),
        'noop-upstream': ({ upstream }) => console.log(`upstream ${upstream.name.bold} ${upToDate}`),
        'noop-target': ({ target }) => console.log(`target ${target.target.bold} ${upToDate}`),
        'noop-certificate': ({ identityClue }) => console.log(`certificate ${identityClue}... ${upToDate}`),
        'noop-certificate-sni': ({ sni }) => console.log(`certificate sni ${sni.name} ${upToDate}`),
        'noop-certificate-sni-removed': ({ sni }) => console.log(`certificate sni ${sni.name} ${'is NOT present'.bold.green}`),
        'noop-clear-service-routes': ({ service: { name } }) => console.log(`service ${name} has no old routes to clear`),
        'noop-skip-remove-routes': ({ service: { name } }) => console.log('Skipping removing old routes due to cli flag'),
        'noop-acl': ({acl: {group}}) => console.log(`- acl ${group.bold} ${upToDate}`),
        unknown: action => console.log('unknown action', action),
    })(message.params),
    request: ({ uri, params: { method, body } }) => console.log(
        `\n${method.bold.blue}`, uri.blue, "\n", body ? censorLogData(body) : ''
    ),
    response: ({ ok, status, statusText, content }) => console.log(
        ok ? `${status} ${statusText.bold}`.green : `${status} ${statusText.bold}`.red,
        censorLogData(content)
    ),
    debug: () => {},
    'experimental-features': ({ message }) => console.log(message),
    'kong-info': ({ version }) => console.log(`Kong version: ${version}`),
    unknown: message => console.log('unknown', message),
});
