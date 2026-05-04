import type { CustomLane, ProcessState, ProcessStep } from "@/data/processData";
import type { SavedProcessState } from "@/lib/storage/processState";

export function buildSavedProcessState(
  state: ProcessState,
  parkedSteps: ProcessStep[],
  activeLanes: string[],
  customLanes: CustomLane[],
): SavedProcessState {
  const autoLinks: SavedProcessState["autoLinks"] = {};
  state.automations.forEach((automation) => {
    if (automation.fromStepId && automation.toStepId) {
      autoLinks[automation.id] = {
        fromStepId: automation.fromStepId,
        toStepId: automation.toStepId,
      };
    }
  });

  return {
    steps: state.steps,
    connections: state.connections,
    autoLinks,
    parkedSteps,
    activeLanes,
    customLanes,
  };
}

export function restoreSavedProcessState(
  current: ProcessState,
  saved: ProcessState,
): ProcessState {
  return {
    ...saved,
    automations: current.automations.map((automation) => {
      const savedAutomation = saved.automations.find((item) => item.id === automation.id);
      return savedAutomation
        ? {
          ...automation,
          fromStepId: savedAutomation.fromStepId,
          toStepId: savedAutomation.toStepId,
        }
        : {
          ...automation,
          fromStepId: undefined,
          toStepId: undefined,
        };
    }),
  };
}
