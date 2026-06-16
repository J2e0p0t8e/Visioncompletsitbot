import type { APIInteractionGuildMember, GuildMember } from "discord.js";
import { config } from "../config.js";

function getRoleIds(member: GuildMember | APIInteractionGuildMember): string[] {
  if (Array.isArray(member.roles)) {
    return member.roles;
  }
  return [...member.roles.cache.keys()];
}

/** Staff Vision+ : uniquement via les rôles Discord (STAFF_ROLE_IDS). */
export function isStaff(member: GuildMember | APIInteractionGuildMember): boolean {
  if (config.staffRoleIds.length === 0) return false;

  const roleIds = getRoleIds(member);
  return roleIds.some((id) => config.staffRoleIds.includes(id));
}

export const STAFF_DENIED_MESSAGE =
  "Cette commande est réservée au staff Vision+ (rôles autorisés uniquement).";
