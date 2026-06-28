import { acceptProposal, rejectProposal } from "../../core/evaluation/accept";
import { fail, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function proposalCommand(repo: Repository, args: string[]): void {
  const sub = args[0] ?? "list";
  if (sub === "show") {
    const id = args[1] ?? fail("qm proposal show requires proposal id");
    const proposal = repo.getProposal(id) ?? fail(`Proposal not found: ${id}`);
    printJson({ proposal });
    return;
  }
  if (sub === "accept" || sub === "reject") {
    const id = args[1] ?? fail(`qm proposal ${sub} requires proposal id`);
    if (sub === "accept") printJson(acceptProposal(repo, id));
    else printJson({ proposal: rejectProposal(repo, id), applied: null });
    return;
  }
  const proposals = repo.listProposals();
  if (args.includes("--json")) printJson({ proposals });
  else printText(proposals.map((proposal) => `${proposal.id}\t${proposal.kind}\t${proposal.accepted === null ? "pending" : proposal.accepted ? "accepted" : "rejected"}`));
}
