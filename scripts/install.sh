#!/usr/bin/env bash
# Install the dsh-zlib-plugin skills into DeepSeek Harness.
#
#   scripts/install.sh                 # select this package as a profile bundle (recommended)
#   scripts/install.sh --skills        # symlink the skills into the user skill root instead
#   scripts/install.sh --uninstall     # undo either
#
# Bundle mode (default) is what DeepSeek Harness Desktop uses: the profile's
# dsh.profile.bundles list selects this package, its cordis.patch.yml mounts
# src/plugin.js, and that module registers both skills on the skill registry.
# The desktop profile disables the host skill-filesystem row (agent presets own
# local discovery), so a plain skills directory is not seen there.
#
# --skills mode writes $DSH_HOME/skills/<name> for compositions that do serve
# the filesystem provider's default roots — the CLI/TUI profiles, or a profile
# whose preset keeps `includeDefaultRoots` on.
#
# Do not enable both for the same skill names: a runtime registration outranks
# the filesystem candidate and the harness logs a shadowing warning.
set -euo pipefail

PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="dsh-zlib-plugin"
SKILLS_SRC="${PACKAGE_DIR}/skills"
DSH_HOME="${DSH_HOME:-${HOME}/.dsh}"
SKILLS_DEST="${DSH_HOME}/skills"
PROFILE_DIR="${DSH_PROFILE_DIR:-${DSH_HOME}/profiles/desktop}"

MODE="bundle"
UNINSTALL="no"
FORCE="no"

usage() {
	cat <<'EOF'
Usage: scripts/install.sh [--skills] [--uninstall] [--force] [--profile DIR]

  (default)      select this package as a bundle in the profile
  --skills       symlink skills/<name> into $DSH_HOME/skills/<name> instead
  --uninstall    undo the bundle selection (and either skill symlinks)
  --force        replace an existing non-symlink skill directory
  --profile DIR  profile directory (default: $DSH_PROFILE_DIR)

Environment: DSH_HOME (default ~/.dsh), DSH_PROFILE_DIR (default $DSH_HOME/profiles/desktop)

After a bundle install, run `pnpm install` in the profile directory (or install
through the plugin manager, which does it for you) so the link resolves.
EOF
}

while [ $# -gt 0 ]; do
	case "$1" in
	--skills) MODE="skills" ;;
	--uninstall) UNINSTALL="yes" ;;
	--force) FORCE="yes" ;;
	--profile)
		shift
		PROFILE_DIR="${1:?--profile needs a directory}"
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "unknown argument: $1" >&2
		usage >&2
		exit 2
		;;
	esac
	shift
done

skill_names() {
	find "${SKILLS_SRC}" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort
}

install_skills() {
	mkdir -p "${SKILLS_DEST}"
	local name target
	while IFS= read -r name; do
		target="${SKILLS_DEST}/${name}"
		if [ -L "${target}" ]; then
			rm "${target}"
		elif [ -e "${target}" ]; then
			if [ "${FORCE}" != "yes" ]; then
				echo "skip ${target}: exists and is not a symlink (re-run with --force to replace)" >&2
				continue
			fi
			rm -rf "${target}"
		fi
		ln -s "${SKILLS_SRC}/${name}" "${target}"
		echo "linked ${target} -> ${SKILLS_SRC}/${name}"
	done < <(skill_names)
}

uninstall_skills() {
	local name target
	while IFS= read -r name; do
		target="${SKILLS_DEST}/${name}"
		if [ -L "${target}" ] && [ "$(readlink "${target}")" = "${SKILLS_SRC}/${name}" ]; then
			rm "${target}"
			echo "removed ${target}"
		fi
	done < <(skill_names)
}

bundle_select() {
	local manifest="${PROFILE_DIR}/package.json"
	if [ ! -f "${manifest}" ]; then
		mkdir -p "${PROFILE_DIR}"
		printf '{\n  "name": "dsh-profile",\n  "private": true,\n  "dsh": {\n    "profile": {\n      "bundles": []\n    }\n  },\n  "dependencies": {}\n}\n' >"${manifest}"
	fi
	cp "${manifest}" "${manifest}.bak-${PACKAGE_NAME}"
	node -e '
const fs = require("node:fs");
const [file, pkg, name] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
manifest.dsh ??= {};
manifest.dsh.profile ??= {};
manifest.dsh.profile.bundles ??= [];
if (!manifest.dsh.profile.bundles.includes(name)) manifest.dsh.profile.bundles.push(name);
manifest.dependencies ??= {};
manifest.dependencies[name] = `link:${pkg}`;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
' "${manifest}" "${PACKAGE_DIR}" "${PACKAGE_NAME}"
	echo "selected bundle ${PACKAGE_NAME} in ${manifest} (backup: ${manifest}.bak-${PACKAGE_NAME})"
	echo "now install the link: (cd ${PROFILE_DIR} && pnpm install)"
}

bundle_deselect() {
	local manifest="${PROFILE_DIR}/package.json"
	[ -f "${manifest}" ] || return 0
	node -e '
const fs = require("node:fs");
const [file, name] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
const bundles = manifest.dsh?.profile?.bundles;
if (Array.isArray(bundles)) manifest.dsh.profile.bundles = bundles.filter((entry) => entry !== name);
if (manifest.dependencies) delete manifest.dependencies[name];
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
' "${manifest}" "${PACKAGE_NAME}"
	echo "removed bundle ${PACKAGE_NAME} from ${manifest}"
}

if [ "${UNINSTALL}" = "yes" ]; then
	uninstall_skills
	bundle_deselect
	echo "${PACKAGE_NAME} uninstalled from ${SKILLS_DEST} and ${PROFILE_DIR}"
	exit 0
fi

if [ "${MODE}" = "skills" ]; then
	install_skills
	echo
	echo "Skills installed under ${SKILLS_DEST}. Usable where the profile serves"
	echo "the filesystem provider's default roots; the desktop profile does not."
else
	bundle_select
	echo
	echo "Bundle selected. Install the link, then reload the harness:"
	echo "  (cd ${PROFILE_DIR} && pnpm install)"
	echo "The plugin manager's Install action does both from the Web UI."
fi
