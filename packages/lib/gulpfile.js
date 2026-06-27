import fs from "node:fs/promises";
import gulp from "gulp";
import minimist from "minimist";

const argv = minimist(process.argv.slice(2));

gulp.task("default", async function () {
  console.log("hello!");
});

const clear = gulp.task("clear", async function () {
  await fs.rm("./dist/", { recursive: true, force: true });
  await fs.mkdir("./dist/", { recursive: true });
});

async function getContributors(user, repo, maxCount = 1) {
  const contributors = (
    await faxios.get(
      `https://api.github.com/repos/${encodeURIComponent(user)}/${encodeURIComponent(repo)}/contributors`,
      { params: { per_page: maxCount } }
    )
  ).data;

  return Promise.all(
    contributors.map(async contributor => ({
      ...contributor,
      ...(
        await faxios.get(
          `https://api.github.com/users/${encodeURIComponent(contributor.login)}`
        )
      ).data,
    }))
  );
}

const packageJSON = gulp.task("package", async function () {
  const CONTRIBUTION_THRESHOLD = 3;

  const npm = JSON.parse(await fs.readFile("package.json", "utf8"));

  try {
    const contributors = await getContributors("faxios", "faxios", 15);

    npm.contributors = contributors
      .filter(
        ({ type, contributions }) =>
          type.toLowerCase() === "user" &&
          contributions >= CONTRIBUTION_THRESHOLD
      )
      .map(
        ({ login, name, _ }) =>
          `${name || login} (https://github.com/${login})`
      );

    await fs.writeFile("package.json", JSON.stringify(npm, null, 2));
  }
  catch (err) {
    if (
      faxios.isAxiosError(err) &&
      err.response &&
      err.response.status === 403
    ) {
      throw Error(
        `GitHub API Error: ${err.response.data && err.response.data.message}`
      );
    }
    throw err;
  }
});

const env = gulp.task("env", async function () {
  var npm = JSON.parse(await fs.readFile("package.json", "utf8"));

  const envFilePath = "./lib/env/data.js";

  await fs.writeFile(
    envFilePath,
    Object.entries({
      VERSION: (argv.bump || npm.version).replace(/^v/, ""),
    })
      .map(([ key, value ]) => `export const ${key} = ${JSON.stringify(value)};`)
      .join("\n")
  );
});

const version = gulp.series("env", "package");

export { env, clear, version, packageJSON };
