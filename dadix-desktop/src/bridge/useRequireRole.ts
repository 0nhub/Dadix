export function useRequireRole(): {
  canEditRecords: boolean;
  canEditTables: boolean;
  canEditProject: boolean;
} {
  return {
    canEditRecords: true,
    canEditTables: true,
    canEditProject: true,
  };
}
