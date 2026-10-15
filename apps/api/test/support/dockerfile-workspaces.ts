/**
 * Pure guard (no I/O) against a Dockerfile that forgets a workspace.
 *
 * `yarn install --immutable` needs the `package.json` of EVERY workspace
 * recorded in `yarn.lock`, so each Dockerfile of the monorepo must copy all
 * of them in its `build` stage, and carry them over to its `runtime` stage
 * (`yarn workspace ...` resolves the workspace graph there). A workspace
 * added without updating the Dockerfiles breaks the image build — the
 * 4.6-A and 5.2/5.3 incidents. See ADR 006, apps/api/Dockerfile.
 */

export type DockerfileStages = Record<string, string>;

export interface MissingWorkspaceCopies {
  build: string[];
  runtime: string[];
}

/** `FROM <image> [--flags] AS <name>` — captures the stage name. */
const STAGE_START =
  /^[ \t]*FROM[ \t]+\S+(?:[ \t]+--\S+)*[ \t]+AS[ \t]+(\S+)[ \t]*$/i;

/**
 * Splits a Dockerfile into its named stages: the text of each stage is
 * everything after its `FROM ... AS <name>` line up to the next `FROM`.
 * Stage names are lower-cased. Lines before the first `FROM ... AS` belong
 * to no stage.
 */
export function parseDockerfileStages(text: string): DockerfileStages {
  const stages: DockerfileStages = {};
  let current: string | undefined;

  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const start = STAGE_START.exec(line);
    if (start?.[1] !== undefined) {
      current = start[1].toLowerCase();
      stages[current] = '';
    } else if (/^[ \t]*FROM\b/i.test(line)) {
      // An unnamed `FROM` ends the previous stage without starting a named one.
      current = undefined;
    } else if (current !== undefined) {
      stages[current] += `${line}\n`;
    }
  }

  return stages;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * The exact instruction expected for a workspace. Only whitespace may vary;
 * the flags and the paths are not loosened.
 */
function copyPatterns(workspace: string): {
  build: RegExp;
  runtime: RegExp;
} {
  const path = escapeRegExp(workspace);

  return {
    build: new RegExp(
      `^[ \\t]*COPY[ \\t]+${path}/package\\.json[ \\t]+\\./${path}/package\\.json[ \\t]*$`,
      'm',
    ),
    runtime: new RegExp(
      `^[ \\t]*COPY[ \\t]+--from=build[ \\t]+--chown=node:node[ \\t]+/app/${path}/package\\.json[ \\t]+\\./${path}/package\\.json[ \\t]*$`,
      'm',
    ),
  };
}

/**
 * For each of the `build` and `runtime` stages, the workspaces whose
 * `package.json` is not copied with the expected instruction. Throws if the
 * Dockerfile does not have both stages, so a layout change fails loudly
 * instead of passing in silence.
 */
export function findMissingWorkspaceCopies(
  dockerfile: string,
  workspaces: readonly string[],
): MissingWorkspaceCopies {
  const stages = parseDockerfileStages(dockerfile);

  for (const required of ['build', 'runtime'] as const) {
    if (stages[required] === undefined) {
      throw new Error(
        `Dockerfile has no "${required}" stage (found: ${
          Object.keys(stages).join(', ') || 'none'
        }); the workspace guard cannot analyse it.`,
      );
    }
  }

  const build = stages['build'] as string;
  const runtime = stages['runtime'] as string;

  return {
    build: workspaces.filter((ws) => !copyPatterns(ws).build.test(build)),
    runtime: workspaces.filter((ws) => !copyPatterns(ws).runtime.test(runtime)),
  };
}
