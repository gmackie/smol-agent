# Security Fixes Applied to Jailed Directory Implementation

## Summary
All critical and high-priority security vulnerabilities have been fixed.

## Fixes Applied

### 1. ✅ CRITICAL: Symlink Escape Vulnerability Fixed
**File:** `src/path-utils.js`

**Fix:** Added `fs.realpathSync()` to resolve symlinks before validating paths.

**What changed:**
- `resolveJailedPath()` now resolves both the base path and target path to their real (canonical) paths
- Handles case where target path doesn't exist yet by validating the parent directory
- Symlinks pointing outside the jail are now detected and blocked

**Test:** Verified that symlink `/etc/passwd` ← `jail/link` is blocked.

### 2. ✅ HIGH: Command Restrictions Added
**File:** `src/tools/run_command.js`

**Fix:** Added `validateCommand()` function with forbidden pattern blacklist.

**Blocked patterns:**
- `curl | bash`, `wget | sh` - Remote code execution
- `rm -rf /`, `rm -rf *` - System destruction
- `> /etc/`, `> /root/`, etc. - Writing to system directories
- `cat /etc/shadow`, `cat /etc/gshadow` - Sensitive file access
- `chmod 777` on absolute paths - Privilege escalation
- `mkfifo` - Named pipe exploitation
- `dd of=/dev/` - Disk manipulation

**Test:** All dangerous commands now return error with "forbidden pattern" message.

### 3. ✅ MEDIUM: Global Jail Context Added
**File:** `src/tools/registry.js`

**Fix:** Added `setJailDirectory()` and `getJailDirectory()` functions. Tools now use global jail instead of trusting `cwd` parameter.

**What changed:**
- `execute()` function now ignores `options.cwd` and uses global `_jailDirectory`
- Agent calls `registry.setJailDirectory(this.jailDirectory)` in constructor
- Prevents callers from overriding the jail directory

### 4. ✅ MEDIUM: Memory Tool Fixed
**File:** `src/tools/memory.js`

**Fix:** Now uses `resolveJailedPath()` for memory file path.

**What changed:**
- `loadMemories()` and `saveMemories()` use `resolveJailedPath(cwd, MEMORY_DIR)`
- Prevents memory files from being written outside jail

### 5. ✅ MEDIUM: Plan Tools Fixed
**File:** `src/tools/save_plan.js`, `src/tools/plan_tools.js`

**Fix:** All plan functions now accept and use `cwd` parameter with jail validation.

**What changed:**
- `savePlan()`, `savePlanProgress()`, `loadPlanProgress()`, `getCurrentPlan()`, `updatePlanStatus()` all validate paths
- Plans are now saved within the jail directory, not `process.cwd()`
- Tool execute functions pass `{ cwd }` context to plan functions

### 6. ✅ Agent Integration
**File:** `src/agent.js`

**Fix:** Agent initializes global jail directory in registry constructor.

**What changed:**
- Added `registry.setJailDirectory(this.jailDirectory)` call in Agent constructor
- Ensures all tools use the correct jail from the start

## Tests Passed

```
✓ Normal path resolution
✓ Path traversal (../) blocked
✓ Absolute path blocked
✓ Symlink escape blocked
✓ Registry jail directory set/get
✓ curl | bash blocked
✓ rm -rf / blocked
✓ cat /etc/shadow blocked
✓ wget | sh blocked
✓ Writing to /etc blocked
✓ chmod 777 blocked

RESULTS: 11 passed, 0 failed
```

## Defense in Depth

The fixes implement multiple layers of security:

1. **Path validation** - Symlinks resolved before checking
2. **Global jail context** - Cannot be overridden by callers
3. **Command blacklist** - Dangerous operations blocked
4. **Registry validation** - Central enforcement point

## Remaining Considerations

### Low-Priority Items (Not Fixed)
- **Auto-approve bypass** - By design for user convenience
- **Network access** - No network isolation implemented (would require containerization)

### Future Enhancements
- Add audit logging for all file operations
- Implement rate limiting for file operations
- Consider seccomp/chroot/containerization for production use
- Add whitelist mode for run_command (only allow specific commands)