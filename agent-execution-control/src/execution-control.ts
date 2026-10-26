import { dependencyDigest, envelopeDigest, newIdentity, parseActionEnvelope } from "./model.ts";
import type { AttemptSnapshot } from "./model.ts";
import type { AdapterStartPort, ClaimCommand, ClaimResult, DispatchCommand, ExecutionControlPort } from "./ports.ts";
import type { ControlRepository } from "./repository.ts";

export class ExecutionControl implements ExecutionControlPort {
  private readonly repository: ControlRepository;
  private readonly adapterStart: AdapterStartPort;

  public constructor(
    repository: ControlRepository,
    adapterStart: AdapterStartPort,
  ) {
    this.repository = repository;
    this.adapterStart = adapterStart;
  }

  public async claim(command: ClaimCommand): Promise<ClaimResult> {
    const envelope = parseActionEnvelope(command.envelope);
    return this.repository.atomicClaim({
      permitId: command.permitId,
      envelope,
      envelopeDigest: envelopeDigest(envelope),
      dependencyDigest: dependencyDigest(envelope.dependencies),
      attemptId: newIdentity("attempt"),
    });
  }

  public async dispatch(command: DispatchCommand): Promise<AttemptSnapshot> {
    const envelope = parseActionEnvelope(command.envelope);
    const fence = newIdentity("fence");
    const reservation = await this.repository.reserveDispatch({
      attemptId: command.attemptId,
      envelope,
      envelopeDigest: envelopeDigest(envelope),
      dependencyDigest: dependencyDigest(envelope.dependencies),
      fence,
    });

    try {
      let result;
      try {
        result = await this.adapterStart.start(envelope, fence);
      } catch (error) {
        const evidence = error instanceof Error ? error.message : "adapter start threw an unknown value";
        return await this.repository.recordAmbiguousStart(command.attemptId, fence, evidence);
      }
      if (!result.started) return await this.repository.recordNoStart(command.attemptId, fence);
      return await this.repository.recordAdapterStart(command.attemptId, fence, result.report);
    } finally {
      await reservation.release();
    }
  }
}
