const helperFunctions = require("./helperFunctions");

function getFormattedWorldStateMapName(levelName) {
  return (
    levelName
      // Uppercases the first character in levelName so long as it's not
      // part of the word "inside". This is important because of the current
      // naming convention used in worldState properties
      .replace(/^(.)(?!nside)/g, (_, $1) => $1.toUpperCase())
      // Removes underscores and uppercases the character immediately after them
      .replace(/_(.)/g, (_, $1) => $1.toUpperCase())
  );
}

function getWorldStateMapName(world) {
  let worldStateMapName = "";
  const levelName = world.getCurrentLevelName();
  const mapName = world.getCurrentMapName();

  // The current naming convention when the map is "default" is "inside{LevelName}", otherwise "inside{MapName}"
  if (mapName === "default") {
    worldStateMapName = getFormattedWorldStateMapName(levelName);
  } else {
    worldStateMapName = getFormattedWorldStateMapName(mapName);
  }

  // Prepend "inside" to the final map name if it isn't already there
  if (!worldStateMapName.includes("inside")) {
    worldStateMapName = "inside" + worldStateMapName;
  }

  return worldStateMapName;
}

module.exports = async function handleSpells(event, world, worldState) {
  // If the target of the event isn't spellable, none of what's in this script needs to run
  if (!event.target.spellable) {
    return;
  }

  const {
    applyDisappearTween,
    destroyObject,
    unlockObject,
    unlockTransition,
    openDoor,
  } = helperFunctions(event, world, worldState);
  const worldStateMapName = getWorldStateMapName(world);

  /*
   *
   * SPELL FUNCTION DEFINITIONS
   *
   */
  const spells = {
    disappear: (event) => disappear(event),
    move: (event) => move(event),
    unlock: (event) => unlock(event),
  };

  const disappear = (event) => {
    applyDisappearTween(event.target.group || event.target.key).then(() => {
      destroyObject(event.target.group || event.target.key);

      if (event.target.unlocksObject) {
        unlockObject(event.target.unlocksObject);
      }
      if (event.target.unlocksTransition) {
        unlockTransition(event.target.unlocksTransition);
      }

      world.stopUsingTool();
      world.enablePlayerMovement();
    });
  };

  const move = (event) => {}; // coming soon

  const unlock = (event) => {
    openDoor(event.target.group || event.target.key);

    // Stop using tool after a second
    world.wait(1000).then(() => {
      world.stopUsingTool();
      world.enablePlayerMovement();
    });
  };

  const allObstacleSpellRequirementsAreMet = (group) => {
    const worldStateMap = worldState[worldStateMapName];

    if (!worldStateMap) {
      console.warn(
        `No "${worldStateMapName}" property found! Make sure one exists in your event.js file's worldState.`
      );

      return true;
    }

    const entities = worldStateMap.entities;

    if (!entities) {
      console.warn(
        `No "${worldStateMap}.entities" property could be found in your event.js file's worldState!`
      );

      return true;
    }

    const entity = entities[group];

    if (!entity) {
      console.warn(
        `No "${group}" entity could be found in "${worldStateMapName}.entities" as part of your event.js file's worldState! Make sure it shares the name of the Tiled Object's "group" property (or "key" property if you're not using "group").`
      );

      return true;
    }

    const entitySpell = entity.spell[event.target.spell_type];

    if (!entitySpell) {
      console.warn(
        `No "${event.target.spell_type}" property found in "${worldStateMapName}.entities["${group}"].spell!`
      );

      return true;
    }

    const entitySpellRequirementEntries = Object.entries(
      entitySpell.requirements
    );
    let allRequirementsAreMet = true;

    // Invokes all of the requirement predicate functions for the target entity and calls the
    // associated success/failure method for each one if they exist
    for (let i = 0; i < entitySpellRequirementEntries.length; i++) {
      const [key, predicate] = entitySpellRequirementEntries[i];
      const requirementMet = predicate({ event, world, worldState });
      const actions = requirementMet ? "successActions" : "failureActions";

      if (entitySpell[actions] && entitySpell[actions][key]) {
        entitySpell[actions][key]({ event, world, worldState });
      }

      if (!requirementMet) {
        allRequirementsAreMet = false;
        break;
      }
    }

    return allRequirementsAreMet;
  };

  const runSpell = (event) => {
    if (
      !allObstacleSpellRequirementsAreMet(
        event.target.group || event.target.key
      )
    ) {
      return;
    }

    world.disablePlayerMovement();
    world.useTool("wand");
    spells[event.target.spell_type](event);
  };

  runSpell(event);
};
