import Image from "next/image";
import Link from "next/link";
import { Activity, ArrowUpRight, CalendarDays, ChevronDown, Clock, Search, UserPlus, Users } from "lucide-react";

import { NavbarMenu } from "@/components/navbar-menu";
import { MEMBER_FILTERS, MEMBER_PAGE_SIZE, MEMBER_SORTS, membersHref, type MembersResult } from "@/features/admin/members-data";

import styles from "./members.module.css";

const number = new Intl.NumberFormat("en");
const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Tunis" });
const fullDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Tunis" });
const metrics = [
  { key: "total", label: "Total members", description: "Registered accounts", Icon: Users },
  { key: "joined24h", label: "Joined in 24 hours", description: "New accounts", Icon: Clock },
  { key: "joined7", label: "Joined in 7 days", description: "New accounts", Icon: UserPlus },
  { key: "joined30", label: "Joined in 30 days", description: "New accounts", Icon: CalendarDays },
  { key: "active30", label: "Active in 30 days", description: "Accounts with recent activity", Icon: Activity },
] as const;

function MemberDate({ value, empty }: { value: number | null; empty: string }) {
  return value ? <time dateTime={new Date(value).toISOString()} title={`${fullDate.format(value)} (Africa/Tunis)`}>{date.format(value)}</time> : <span className={styles.muted}>{empty}</span>;
}

export function MembersView({ result }: { result: MembersResult }) {
  const { summary, query, list } = result;
  const filtered = query.query !== "" || query.filter !== "all";

  return (
    <div className={styles.view}>
      <section aria-label="Member summary">
        <div className={styles.metrics}>
          {metrics.map(({ key, label, description, Icon }) => (
            <div className={styles.metric} key={key}>
              <div className={styles.metricLabel}><span>{label}</span><Icon size={16} strokeWidth={1.6} aria-hidden="true" /></div>
              <p className={styles.metricValue}>{summary[key] === null ? <span className={styles.unavailable}>Unavailable</span> : number.format(summary[key])}</p>
              <p className={styles.metricHint}>{description}</p>
            </div>
          ))}
        </div>
        <p className={styles.note}>Counts cover all members. Refresh the page for updates. Recent activity does not mean someone is online now.</p>
      </section>

      <section className={styles.directory} aria-labelledby="member-list-heading">
        <div className={styles.toolbar}>
          <div className={styles.toolbarTop}>
            <h2 id="member-list-heading">Accounts{list ? <span className={styles.count}>{number.format(list.total)}</span> : null}</h2>
            <div className={styles.filters}>
              <NavbarMenu label="Filter members" trigger={<>{MEMBER_FILTERS[query.filter]}<ChevronDown size={15} aria-hidden="true" /></>} triggerClassName={styles.filterButton} menuClassName={styles.menu} keepInViewport items={Object.entries(MEMBER_FILTERS).map(([value, label]) => ({ label, selected: query.filter === value, href: membersHref(query, { filter: value as typeof query.filter, page: 1 }) }))} />
              <NavbarMenu label="Sort members" trigger={<>{MEMBER_SORTS[query.sort]}<ChevronDown size={15} aria-hidden="true" /></>} triggerClassName={styles.filterButton} menuClassName={styles.menu} keepInViewport items={Object.entries(MEMBER_SORTS).map(([value, label]) => ({ label, selected: query.sort === value, href: membersHref(query, { sort: value as typeof query.sort, page: 1 }) }))} />
            </div>
          </div>
          <form method="get" action="/admin/subscribers" className={styles.search}>
            <input type="hidden" name="filter" value={query.filter} />
            <input type="hidden" name="sort" value={query.sort} />
            <div className={styles.searchField}>
              <Search size={17} aria-hidden="true" />
              <label htmlFor="member-search" className="sr-only">Search members by name, email or username</label>
              <input className="focus-ring" id="member-search" type="search" name="q" defaultValue={query.query} key={query.query} maxLength={254} placeholder="Search name, email or username" />
            </div>
            <button className={`focus-ring ${styles.searchButton}`}>Search</button>
            {filtered ? <Link prefetch={false} href="/admin/subscribers" className={`focus-ring ${styles.clear}`}>Clear</Link> : null}
          </form>
        </div>

        {!list ? (
          <div className={styles.empty} role="status"><h3>Members couldn’t be loaded</h3><p>The account service is temporarily unavailable. Refresh this page to try again.</p></div>
        ) : list.rows.length === 0 ? (
          <div className={styles.empty}><h3>{filtered ? "No matching members" : "No members yet"}</h3><p>{filtered ? "Try another name or email, or clear the filters." : "People will appear here after creating an Inspora account."}</p></div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="sr-only">Registered Inspora accounts. Dates are shown in Africa/Tunis.</caption>
              <thead><tr><th scope="col">Member</th><th scope="col">X account</th><th scope="col">Joined</th><th scope="col">Last sign-in</th></tr></thead>
              <tbody>{list.rows.map((member) => (
                <tr key={member.id}>
                  <td className={styles.identityCell}>
                    <div className={styles.identity}>
                      {member.imageUrl ? <Image className={styles.avatar} src={member.imageUrl} alt="" width={38} height={38} unoptimized /> : <span className={styles.initials} aria-hidden="true">{Array.from(member.name)[0]?.toUpperCase()}</span>}
                      <div className={styles.person}><span className={styles.name}>{member.name}</span><span className={styles.email}>{member.email ?? "No primary email"}</span></div>
                    </div>
                  </td>
                  <td data-label="X account">{member.xUsername ? <a href={`https://x.com/${member.xUsername}`} target="_blank" rel="noopener noreferrer" className={`focus-ring ${styles.xLink}`} aria-label={`@${member.xUsername} on X (opens in a new tab)`}>@{member.xUsername}<ArrowUpRight size={13} aria-hidden="true" /></a> : <span className={styles.muted}>Not connected</span>}</td>
                  <td data-label="Joined"><MemberDate value={member.joinedAt} empty="Unavailable" /></td>
                  <td data-label="Last sign-in"><MemberDate value={member.lastSignInAt} empty="Not recorded" /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {list && list.total > 0 ? (
          <div className={styles.footer}>
            <p>{number.format((query.page - 1) * MEMBER_PAGE_SIZE + 1)}–{number.format(Math.min(query.page * MEMBER_PAGE_SIZE, list.total))} of {number.format(list.total)} members</p>
            <nav aria-label="Member pages" className={styles.pagination}>
              {query.page > 1 ? <Link prefetch={false} className={`focus-ring ${styles.pageButton}`} href={membersHref(query, { page: query.page - 1 })}>Previous</Link> : <span className={styles.disabled}>Previous</span>}
              <span>Page {query.page} of {list.totalPages}</span>
              {query.page < list.totalPages ? <Link prefetch={false} className={`focus-ring ${styles.pageButton}`} href={membersHref(query, { page: query.page + 1 })}>Next</Link> : <span className={styles.disabled}>Next</span>}
            </nav>
          </div>
        ) : null}
      </section>
    </div>
  );
}
