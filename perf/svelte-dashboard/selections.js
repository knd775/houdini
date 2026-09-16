const scalar = (type, keyRaw) => ({ type, keyRaw, visible: true })
export const linked = (type, keyRaw, selection) => ({ ...scalar(type, keyRaw), selection })
export const person = {
	fields: {
		id: scalar('ID', 'id'),
		name: scalar('String', 'name'),
		online: scalar('Boolean', 'online'),
		role: scalar('String', 'role'),
	},
}
export const task = {
	fields: {
		id: scalar('ID', 'id'),
		title: scalar('String', 'title'),
		status: scalar('String', 'status'),
		estimate: scalar('Int', 'estimate'),
		spent: scalar('Int', 'spent'),
		priority: scalar('Int', 'priority'),
		assignee: linked('User', 'assignee', person),
	},
}
export const project = {
	fields: {
		id: scalar('ID', 'id'),
		name: scalar('String', 'name'),
		budget: scalar('Int', 'budget'),
		tasks: linked('Task', 'tasks', task),
	},
}
export const dashboardSelection = {
	fields: {
		workspace: linked('Workspace', 'workspace', {
			fields: {
				id: scalar('ID', 'id'),
				name: scalar('String', 'name'),
				projects: linked('Project', 'projects', project),
			},
		}),
		viewer: linked('User', 'viewer', person),
	},
}
export const peopleSelection = { fields: { people: linked('User', 'people', person) } }
export const activitySelection = {
	fields: {
		activity: linked('Event', 'activity', {
			fields: {
				id: scalar('ID', 'id'),
				action: scalar('String', 'action'),
				actor: linked('User', 'actor', person),
				task: linked('Task', 'task', {
					fields: {
						id: task.fields.id,
						title: task.fields.title,
						status: task.fields.status,
					},
				}),
			},
		}),
	},
}
