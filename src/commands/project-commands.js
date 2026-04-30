import {
  installSource,
  removeSource,
  updateSource,
} from "../source-manager.js";
import {
  setGroupEntries,
  addGroupEntries,
  removeGroup,
  setAgentDefinition,
  setDefaultAgentDefinition,
  removeAgentDefinition,
} from "../policy-manager.js";
import { runProjectInventoryQuery } from "../project-inventory.js";

export function isProjectCommand(token) {
  return token === "install"
    || token === "update"
    || token === "remove"
    || token === "sources"
    || token === "artifacts"
    || token === "groups"
    || token === "agent-definitions";
}

function readRepeatedFlagValues(args, flagName) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flagName) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flagName}`);
    }
    values.push(value);
    index += 1;
  }
  return values;
}

export async function runProjectCommand({ commandName, commandArgs, cwd, io = console }) {
  if (commandName === "install") {
    const reference = commandArgs[0];
    if (!reference) {
      io.error("Usage: smol-agent install <alias|url>");
      return 1;
    }
    const installed = await installSource(cwd, reference);
    io.log(`Installed source ${installed.alias || installed.url}`);
    if (installed.revision) io.log(`Revision: ${installed.revision}`);
    return 0;
  }

  if (commandName === "update") {
    const reference = commandArgs[0] || null;
    const updated = await updateSource(cwd, reference);
    if (Array.isArray(updated)) {
      io.log(`Updated ${updated.length} source${updated.length === 1 ? "" : "s"}.`);
    } else {
      io.log(`Updated source ${updated.alias || updated.url}`);
      if (updated.revision) io.log(`Revision: ${updated.revision}`);
    }
    return 0;
  }

  if (commandName === "remove") {
    const reference = commandArgs[0];
    if (!reference) {
      io.error("Usage: smol-agent remove <alias|url>");
      return 1;
    }
    await removeSource(cwd, reference);
    io.log(`Removed source ${reference}`);
    return 0;
  }

  if (commandName === "groups" && commandArgs[0] === "set") {
    const groupName = commandArgs[1];
    const entries = commandArgs.slice(2);
    if (!groupName || entries.length === 0) {
      io.error("Usage: smol-agent groups set <name> <artifact...>");
      return 1;
    }
    await setGroupEntries(cwd, groupName, entries);
    io.log(`Updated group ${groupName}`);
    return 0;
  }

  if (commandName === "groups" && commandArgs[0] === "add") {
    const groupName = commandArgs[1];
    const entries = commandArgs.slice(2);
    if (!groupName || entries.length === 0) {
      io.error("Usage: smol-agent groups add <name> <artifact...>");
      return 1;
    }
    await addGroupEntries(cwd, groupName, entries);
    io.log(`Updated group ${groupName}`);
    return 0;
  }

  if (commandName === "groups" && commandArgs[0] === "remove") {
    const groupName = commandArgs[1];
    if (!groupName) {
      io.error("Usage: smol-agent groups remove <name>");
      return 1;
    }
    await removeGroup(cwd, groupName);
    io.log(`Removed group ${groupName}`);
    return 0;
  }

  if (commandName === "agent-definitions" && commandArgs[0] === "set") {
    const definitionName = commandArgs[1];
    const optionArgs = commandArgs.slice(2);
    if (!definitionName) {
      io.error("Usage: smol-agent agent-definitions set <name> [--source <id>]... [--group <name>]... [--allow <artifact>]... [--default]");
      return 1;
    }

    try {
      await setAgentDefinition(cwd, definitionName, {
        sourceIds: readRepeatedFlagValues(optionArgs, "--source"),
        defaultGroups: readRepeatedFlagValues(optionArgs, "--group"),
        allowedArtifacts: readRepeatedFlagValues(optionArgs, "--allow"),
        isDefault: optionArgs.includes("--default"),
      });
      io.log(`Updated agent definition ${definitionName}`);
      return 0;
    } catch (err) {
      io.error(err.message);
      return 1;
    }
  }

  if (commandName === "agent-definitions" && commandArgs[0] === "default") {
    const definitionName = commandArgs[1];
    if (!definitionName) {
      io.error("Usage: smol-agent agent-definitions default <name>");
      return 1;
    }
    try {
      await setDefaultAgentDefinition(cwd, definitionName);
      io.log(`Default agent definition: ${definitionName}`);
      return 0;
    } catch (err) {
      io.error(err.message);
      return 1;
    }
  }

  if (commandName === "agent-definitions" && commandArgs[0] === "remove") {
    const definitionName = commandArgs[1];
    if (!definitionName) {
      io.error("Usage: smol-agent agent-definitions remove <name>");
      return 1;
    }
    await removeAgentDefinition(cwd, definitionName);
    io.log(`Removed agent definition ${definitionName}`);
    return 0;
  }

  if (commandName === "sources" || commandName === "artifacts" || commandName === "groups" || commandName === "agent-definitions") {
    try {
      const { lines } = await runProjectInventoryQuery({ commandName, commandArgs, cwd });
      for (const line of lines) io.log(line);
      return 0;
    } catch (err) {
      io.error(err.message);
      return 1;
    }
  }

  io.error(`Unknown command: ${commandName}`);
  return 1;
}
