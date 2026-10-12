import { describe, expect, it } from 'vitest';
import { inspectNotesNativeRecovery } from './recoveryPresentation';
import type { SyncStatus } from './SyncContext';
const base={ownerId:'11111111-1111-4111-8111-111111111111',accessGranted:true,
  recoveryMode:false,status:'synced' as SyncStatus,lastSyncedAt:1,coreConsent:false};
describe('B15 Notes native recovery states',()=>{
  it('does not treat a pending/offline/error request as confirmed cloud recovery',()=>{
    expect(inspectNotesNativeRecovery({...base,status:'pending'}).state).toBe('pending');
    expect(inspectNotesNativeRecovery({...base,status:'offline'}).state).toBe('offline');
    expect(inspectNotesNativeRecovery({...base,status:'error'}).state).toBe('needs-attention');
    expect(inspectNotesNativeRecovery({...base,accessGranted:false}).state).toBe('workspace-required');
    expect(inspectNotesNativeRecovery({...base,ownerId:null}).state).toBe('local-only');
    expect(inspectNotesNativeRecovery({...base,recoveryMode:true}).state).toBe('password-recovery');
    expect(inspectNotesNativeRecovery({...base,coreConsent:true}).coreScope).toBe('allowed-on-device');
    expect(inspectNotesNativeRecovery(base).isOffsiteCertified).toBe(false);
  });
});
