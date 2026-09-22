// The naming rule that every app in pulumi/monorepo uses. It is TypeScript
// source with no build step: each app's Pulumi program compiles it when it
// imports it, so a change here is what the next preview of every app reads.

// The prefix of every name an app makes, such as "web-dev".
export function prefix(app: string, stack: string): string {
  return `${app}-${stack}`;
}
